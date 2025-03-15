const axios = require('axios');
const http = require('http');
const https = require('https');
const querystring = require('querystring');
const logger = require('./logger');

/**
 * AdsPower API客户端
 * 封装与AdsPower软件通信的API
 */
class AdsPowerAPI {
  /**
   * 构造函数
   * @param {Object} options - 配置选项
   * @param {string} options.baseUrl - API基础URL
   */
  constructor(options = {}) {
    // 支持多个可能的API地址
    this.possibleBaseUrls = [
      'http://localhost:50325/api/v1',
      'http://local.adspower.net:50325/api/v1',
      'http://127.0.0.1:50325/api/v1',
      'http://127.0.0.1:50325',  // 尝试无api/v1路径
      'http://localhost:50325',   // 尝试无api/v1路径
      'http://localhost:50325/api', // 只有/api的情况
      'http://127.0.0.1:50325/api', // 只有/api的情况
      'http://localhost:50325/api/v2', // 尝试v2版本API
      'http://localhost:50325/api/v3', // 尝试v3版本API
      'http://localhost:49725/api/v1', // 尝试其他可能的端口
      'http://localhost:49825/api/v1'  // 尝试其他可能的端口
    ];
    
    // 优先使用提供的URL，否则使用默认值
    this.baseUrl = options.baseUrl || this.possibleBaseUrls[0];
    this.timeout = options.timeout || 15000; // 增加默认超时时间到15秒
    this.maxRetries = options.maxRetries || 3; // 增加默认重试次数
    
    // 创建axios实例
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    // 添加响应拦截器用于日志记录
    this.client.interceptors.response.use(
      response => {
        return response.data;
      },
      error => {
        if (error.response) {
          logger.error(`AdsPower API错误: ${error.response.status} - ${error.response.data?.msg || error.message}`);
        } else if (error.request) {
          logger.error(`AdsPower API请求未收到响应: ${error.message}`);
        } else {
          logger.error(`AdsPower API请求配置错误: ${error.message}`);
        }
        return Promise.reject(error);
      }
    );
    
    // 检查AdsPower是否在运行
    this.isRunning = false;
    this.findWorkingApiUrl();
  }
  
  /**
   * 尝试所有可能的API URL，找到可用的连接
   */
  async findWorkingApiUrl() {
    console.log('正在尝试查找可用的AdsPower API地址...');
    
    for (const url of this.possibleBaseUrls) {
      try {
        console.log(`尝试连接: ${url}`);
        
        // 创建测试客户端
        const testClient = axios.create({
          baseURL: url,
          timeout: 3000 // 减少超时时间，加快探测速度
        });
        
        // 尝试不同的API请求路径
        const testPaths = [
          { method: 'get', path: '/user/list', params: { page: 1, page_size: 1 } },
          { method: 'post', path: '/user/list', data: { page: 1, page_size: 1 } },
          { method: 'get', path: '/browser/list', params: { page: 1, page_size: 1 } },
          { method: 'post', path: '/list_browser', data: { page: 1, page_size: 1 } },
          { method: 'get', path: '/list', params: { page: 1, page_size: 1 } },
          { method: 'get', path: '/group/list' },
          { method: 'get', path: '/status' }
        ];
        
        for (const test of testPaths) {
          try {
            console.log(`尝试 ${test.method.toUpperCase()} ${url}${test.path}`);
            
            let response;
            if (test.method === 'get') {
              response = await testClient.get(test.path, { params: test.params });
            } else {
              response = await testClient.post(test.path, test.data);
            }
            
            // 检查响应是否成功
            if (response.data && 
                (response.data.code === 0 || 
                 response.data.status === 'success' || 
                 response.data.success === true)) {
              
              console.log(`✅ 找到可用的AdsPower API: ${url}${test.path}`);
              console.log(`响应数据:`, JSON.stringify(response.data).substring(0, 200) + '...');
              
              // 保存成功的URL和路径
              this.baseUrl = url;
              this.successPath = test.path;
              this.successMethod = test.method;
              this.client.defaults.baseURL = url;
              this.isRunning = true;
              
              return true;
            } else {
              console.log(`API ${url}${test.path} 返回非成功状态:`, JSON.stringify(response.data).substring(0, 100) + '...');
            }
          } catch (pathError) {
            console.log(`尝试 ${test.method.toUpperCase()} ${url}${test.path} 失败:`, pathError.message);
          }
        }
      } catch (error) {
        console.log(`API基础URL ${url} 连接失败:`, error.message);
      }
    }
    
    console.error('⚠️ 警告: 无法连接到任何AdsPower API地址。');
    console.log('请检查以下事项:');
    console.log('1. 确保AdsPower已启动并运行');
    console.log('2. 打开AdsPower设置 -> 高级设置 -> 开发者选项 -> 启用API');
    console.log('3. 检查API端口设置（默认为50325）');
    console.log('4. 尝试重启AdsPower应用');
    
    return false;
  }
  
  // 带重试的API请求方法
  async request(method, endpoint, data = null, options = {}) {
    const retries = options.retries || this.maxRetries;
    let lastError = null;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) {
          // 使用指数退避策略
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          logger.info(`重试AdsPower API请求 (${attempt}/${retries}): ${endpoint}，等待 ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        const config = {
          method,
          url: endpoint,
          timeout: options.timeout || this.timeout
        };
        
        if (method.toLowerCase() === 'get' && data) {
          config.params = data;
        } else if (data) {
          config.data = data;
        }
        
        const response = await this.client.request(config);
        
        // 检查API响应是否成功
        if (response.code !== 0 && response.code !== undefined) {
          // 检查更多API速率限制相关错误
          const rateLimit = response.msg && (
            response.msg.includes('Too many request') ||
            response.msg.includes('rate limit') ||
            response.code === 10002
          );
          
          if (rateLimit && attempt < retries) {
            // 速率限制错误使用更长的等待时间
            const delay = Math.min(2000 * Math.pow(2, attempt), 15000);
            logger.warn(`AdsPower API速率限制，等待${delay}ms后重试...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          
          // 其他API错误直接返回
          return response;
        }
        
        return response;
      } catch (error) {
        lastError = error;
        
        // 判断错误类型
        const isNetworkError = !error.response && (error.code === 'ECONNABORTED' || error.message.includes('network'));
        const isTimeout = error.message && error.message.includes('timeout');
        const isServerError = error.response && error.response.status >= 500;
        
        // 这些错误类型适合重试
        if ((isNetworkError || isTimeout || isServerError) && attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          logger.warn(`AdsPower API ${isTimeout ? '超时' : isServerError ? '服务器错误' : '网络错误'}，等待${delay}ms后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // 达到最大重试次数，抛出最后一个错误
        if (attempt === retries) {
          logger.error(`AdsPower API请求失败，已达到最大重试次数 (${retries}): ${error.message}`);
          throw new Error(`AdsPower API请求失败 (已重试${retries}次): ${error.message}`);
        }
      }
    }
    
    throw lastError;
  }
  
  /**
   * 获取环境列表
   * @param {number|object} page - 页码或请求选项对象
   * @param {number} [pageSize] - 每页大小 (如果第一个参数是页码)
   * @param {string} [groupId] - 分组ID (可选，默认为空字符串)
   * @returns {Promise<object>} - 返回环境列表信息
   */
  async getEnvironmentList(page, pageSize, groupId = '') {
    console.log(`调用getEnvironmentList方法，参数: page=${page}, pageSize=${pageSize}, groupId=${groupId || '空'}`);
    
    // 如果API未连接，尝试重新连接
    if (!this.isRunning) {
      console.log('API似乎未连接，尝试重新连接...');
      await this.findWorkingApiUrl();
    }
    
    // 处理参数
    let options = {};
    
    if (typeof page === 'object') {
      // 如果第一个参数是对象，则直接用作选项
      options = page;
      console.log('以对象形式传入参数:', options);
    } else {
      // 否则构造选项对象
      options = {
        page: page,
        page_size: pageSize || 100
      };
      
      // 只有当分组ID有值时才添加
      if (groupId) {
        // 检查是否为特殊值'all'
        if (groupId === 'all') {
          console.log('检测到分组ID为"all"，不添加group_id参数获取所有环境');
        } else {
          options.group_id = groupId;
          console.log(`添加分组过滤参数: group_id=${groupId}`);
        }
      } else {
        console.log('无分组过滤参数，将获取所有环境');
      }
    }
    
    // 增加每页记录数，提高效率
    if (options.page_size && options.page_size < 200) {
      options.page_size = 200;
      console.log('自动调整每页大小为200，提高效率');
    }
    
    try {
      console.log(`正在请求AdsPower环境列表，页码: ${options.page || 1}, 每页: ${options.page_size || 100}`);
      
      // 修复路径，确保不重复api/v1
      const userListPath = '/user/list'; // 移除前导的/api/v1，因为this.baseUrl已经包含了
      console.log(`使用环境列表API: ${this.baseUrl}${userListPath}`);
      
      let response;
      try {
        // 记录实际请求的URL，确保路径正确
        console.log(`尝试发送GET请求到: ${this.baseUrl}${userListPath}`);
        
        // 尝试GET请求
        response = await this.client.get(userListPath, { params: options });
        if (response && response.code === 0) {
          console.log(`环境列表API响应成功`);
        } else {
          console.warn(`环境列表API响应异常:`, response);
          // 如果是API速率限制，等待一下再重试
          if (response && response.code === -1 && response.msg && response.msg.includes('Too many request')) {
            console.log('检测到API速率限制，等待2秒后重试...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log(`重试GET请求到: ${this.baseUrl}${userListPath}`);
            response = await this.client.get(userListPath, { params: options });
          }
        }
      } catch (error) {
        console.error(`获取环境列表失败:`, error.message);
        // 尝试使用POST方法
        console.log(`尝试使用POST方法获取环境列表: ${this.baseUrl}${userListPath}`);
        response = await this.client.post(userListPath, options);
      }
      
      // 处理响应
      if (response && response.data) {
        let environmentList = [];
        
        // 尝试各种可能的数据格式
        if (response.data.data && Array.isArray(response.data.data.list)) {
          environmentList = response.data.data.list;
          console.log(`成功获取 ${environmentList.length} 个环境 (分页格式)`);
        } else if (Array.isArray(response.data.data)) {
          environmentList = response.data.data;
          console.log(`成功获取 ${environmentList.length} 个环境 (数组格式)`);
        } else if (Array.isArray(response.data)) {
          environmentList = response.data;
          console.log(`成功获取 ${environmentList.length} 个环境 (直接响应格式)`);
        } else if (response.data.list && Array.isArray(response.data.list)) {
          environmentList = response.data.list;
          console.log(`成功获取 ${environmentList.length} 个环境 (list字段格式)`);
        } else {
          // 尝试直接解析响应本身
          if (Array.isArray(response)) {
            environmentList = response;
            console.log(`成功获取 ${environmentList.length} 个环境 (响应数组格式)`);
          } else if (response.list && Array.isArray(response.list)) {
            environmentList = response.list;
            console.log(`成功获取 ${environmentList.length} 个环境 (响应list字段格式)`);
          } else {
            // 尝试解析API返回的不同格式
            console.log('API返回了未知格式，尝试解析:', JSON.stringify(response.data).substring(0, 200) + '...');
            
            // 创建一个空环境列表
            return {
              code: 0,
              msg: '成功获取0个环境（无法解析API格式）',
              data: []
            };
          }
        }
        
        // 简单处理环境数据
        const processedEnvs = environmentList.map(env => {
          // 添加is_running字段
          if (env.is_running === undefined) {
            env.is_running = env.status === 'Active' || env.status === 'Running';
          }
          
          // 确保有user_id字段
          if (!env.user_id && env.id) {
            env.user_id = env.id;
          }
          
          return env;
        });
        
        return {
          code: 0,
          msg: `成功获取${processedEnvs.length}个环境`,
          data: processedEnvs
        };
      } else {
        console.error('API响应格式不正确或为空');
        return { code: -1, msg: 'API响应格式不正确', data: [] };
      }
    } catch (error) {
      console.error('获取环境列表请求出错:', error.message);
      return {
        code: -1,
        msg: `获取环境列表请求出错: ${error.message}`,
        data: []
      };
    }
  }
  
  /**
   * 获取分组列表
   * @returns {Promise<Object>} 分组列表
   */
  async getGroupList() {
    try {
      return await this.request('get', '/group/list', null, { 
        timeout: 15000, 
        retries: 2 
      });
    } catch (error) {
      console.error('获取分组列表失败:', error.message);
      return { code: -1, msg: error.message, data: [] };
    }
  }
  
  /**
   * 获取分组列表 (getGroupList的别名)
   * @returns {Promise<Object>} 分组列表
   */
  async getGroups() {
    return this.getGroupList();
  }
  
  /**
   * 启动浏览器
   * @param {string} userId - 环境ID
   * @returns {Promise<Object>} 启动结果
   */
  async startBrowser(userId, options = {}) {
    const data = { 
      user_id: userId,
      launch_args: options.launchArgs || ["--no-sandbox"]
    };
    
    try {
      return await this.request('get', '/browser/start', data, { 
        timeout: 20000,  // 增加超时时间
        retries: 3       // 增加重试次数 
      });
    } catch (error) {
      console.error(`启动环境 ${userId} 失败:`, error.message);
      return { code: -1, msg: error.message };
    }
  }
  
  /**
   * 打开浏览器 (startBrowser的别名)
   * @param {string} userId - 环境ID
   * @returns {Promise<Object>} 启动结果
   */
  async openBrowser(userId, options = {}) {
    return this.startBrowser(userId, options);
  }
  
  /**
   * 停止浏览器
   * @param {string} userId - 环境ID
   * @returns {Promise<Object>} 停止结果
   */
  async stopBrowser(userId) {
    const data = { user_id: userId };
    
    try {
      return await this.request('get', '/browser/stop', data, { retries: 2 });
    } catch (error) {
      logger.error(`停止环境 ${userId} 失败: ${error.message}`);
      console.error(`停止环境 ${userId} 失败:`, error.message);
      return { code: -1, msg: error.message };
    }
  }
  
  /**
   * 关闭浏览器 (stopBrowser的别名)
   * @param {string} userId - 环境ID
   * @returns {Promise<Object>} 停止结果
   */
  async closeBrowser(userId) {
    return this.stopBrowser(userId);
  }
  
  /**
   * 检查浏览器状态
   * @param {string} userId - 环境ID
   * @returns {Promise<Object>} 状态结果
   */
  async getBrowserStatus(userId) {
    const data = { user_id: userId };
    
    try {
      return await this.request('get', '/browser/active', data);
    } catch (error) {
      logger.error(`获取环境 ${userId} 状态失败: ${error.message}`);
      return { code: -1, msg: error.message };
    }
  }
  
  /**
   * 发送原生HTTP GET请求，不使用axios
   * @param {string} url 请求URL
   * @param {Object} params 查询参数
   * @returns {Promise<Object>} JSON响应
   */
  async nativeHttpGet(url, params = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const http = require('http');
        const https = require('https');
        const querystring = require('querystring');
        
        const queryParams = Object.keys(params).length > 0 ? 
          '?' + querystring.stringify(params) : '';
        const fullUrl = url + queryParams;
        
        // 选择http还是https模块
        const httpModule = fullUrl.startsWith('https') ? https : http;
        
        const options = {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'AdsPower-Manager'
          }
        };
        
        logger.debug(`发送原生HTTP GET请求: ${fullUrl}`);
        
        // 添加随机延迟，防止频繁请求
        const randomDelay = Math.floor(Math.random() * 500) + 500; // 500-1000ms
        await this.delay(randomDelay);
        
        const req = httpModule.get(fullUrl, options, (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const jsonData = JSON.parse(data);
                
                // 检查是否是API限流错误
                if (jsonData.code === -1 && jsonData.msg && jsonData.msg.includes('Too many request per second')) {
                  logger.warn(`API限流: ${jsonData.msg}, 将在2秒后重试...`);
                  
                  // 延迟2秒后重试
                  setTimeout(async () => {
                    try {
                      // 增加更长的延迟后重试
                      await this.delay(2000);
                      const retryResult = await this.nativeHttpGet(url, params);
                      resolve(retryResult);
                    } catch (retryError) {
                      reject(retryError);
                    }
                  }, 2000);
                  
                  return;
                }
                
                resolve(jsonData);
              } catch (e) {
                logger.error(`解析JSON响应失败: ${e.message}`);
                reject(new Error(`解析响应失败: ${e.message}`));
              }
            } else {
              logger.error(`HTTP请求失败，状态码: ${res.statusCode}, 响应内容: ${data}`);
              reject(new Error(`HTTP请求失败，状态码: ${res.statusCode}`));
            }
          });
        });
        
        req.on('error', (err) => {
          logger.error(`HTTP请求错误: ${err.message}`);
          reject(err);
        });
        
        // 设置5秒超时
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error('请求超时'));
        });
      } catch (error) {
        logger.error(`执行nativeHttpGet请求时发生错误: ${error.message}`);
        reject(error);
      }
    });
  }
  
  /**
   * 延迟执行函数
   * @param {number} ms 延迟毫秒数
   * @returns {Promise<void>}
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 使用curl测试AdsPower API
   * 用于诊断环境问题
   */
  async testApiWithCurl() {
    return new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      
      // 测试不同的API端点
      const endpoints = [
        'curl -s "http://localhost:50325/api/v1/user/list?page=1&page_size=100"',
        'curl -s "http://local.adspower.net:50325/api/v1/user/list?page=1&page_size=100"',
        'curl -s "http://127.0.0.1:50325/api/v1/user/list?page=1&page_size=100"'
      ];
      
      console.log('===== 使用curl测试AdsPower API =====');
      
      // 逐个测试每个端点
      const testEndpoint = (index) => {
        if (index >= endpoints.length) {
          console.log('===== curl测试完成 =====');
          resolve({ success: false, message: '所有端点均无法连接' });
          return;
        }
        
        const cmd = endpoints[index];
        console.log(`执行命令: ${cmd}`);
        
        exec(cmd, (error, stdout, stderr) => {
          if (error) {
            console.error(`curl执行错误: ${error.message}`);
            testEndpoint(index + 1);
            return;
          }
          
          if (stderr) {
            console.error(`curl stderr: ${stderr}`);
          }
          
          console.log(`curl响应数据长度: ${stdout.length} 字节`);
          
          try {
            const response = JSON.parse(stdout);
            console.log(`curl响应状态码: ${response.code}`);
            
            if (response.code === 0) {
              console.log('curl测试成功，获取到有效响应');
              
              // 检查是否有环境数据
              if (response.data && response.data.list) {
                console.log(`curl测试发现 ${response.data.list.length} 个环境`);
                
                if (response.data.list.length > 0) {
                  console.log('第一个环境示例:');
                  console.log(JSON.stringify(response.data.list[0], null, 2));
                }
                
                resolve({ 
                  success: true, 
                  data: response,
                  environments: response.data.list,
                  message: `发现 ${response.data.list.length} 个环境`
                });
              } else {
                console.log('curl测试成功，但未找到环境列表');
                console.log('完整响应:', JSON.stringify(response, null, 2));
                resolve({ 
                  success: true, 
                  data: response,
                  environments: [],
                  message: '未找到环境列表' 
                });
              }
            } else {
              console.log(`curl测试API返回错误: ${response.msg || '未知错误'}`);
              testEndpoint(index + 1);
            }
          } catch (parseError) {
            console.error(`解析curl响应失败: ${parseError.message}`);
            console.log('原始响应:', stdout);
            testEndpoint(index + 1);
          }
        });
      };
      
      // 开始测试第一个端点
      testEndpoint(0);
    });
  }
  
  /**
   * 检查API状态
   * @returns {Promise<{available: boolean, url: string}>} API状态信息
   */
  async checkApiStatus() {
    try {
      // 如果已经找到了可用的API URL，直接返回
      if (this.isRunning && this.baseUrl) {
        return {
          available: true,
          url: this.baseUrl + this.successPath,
          method: this.successMethod
        };
      }
      
      // 否则尝试重新查找可用的API URL
      const found = await this.findWorkingApiUrl();
      
      return {
        available: found,
        url: found ? this.baseUrl + this.successPath : null,
        method: found ? this.successMethod : null
      };
    } catch (error) {
      console.error('检查API状态失败:', error.message);
      return {
        available: false,
        error: error.message
      };
    }
  }

  /**
   * 获取环境最后一个URL
   * @param {string} envId 环境ID
   * @returns {Promise<string>} 环境最后URL
   */
  async getLastUrl(envId) {
    if (!envId) {
      throw new Error('环境ID不能为空');
    }

    try {
      // 尝试获取浏览器状态，其中包含lastUrl
      // 修复路径，确保不重复api/v1
      let browserPath = '/browser/active';
      // 记录实际请求的完整URL，便于调试
      console.log(`获取环境URL的实际请求地址: ${this.baseUrl}${browserPath}`);
      
      const params = { user_id: envId };
      
      const response = await axios.get(this.baseUrl + browserPath, { params });
      
      if (response.data && response.data.code === 0 && response.data.data && response.data.data.length > 0) {
        const browser = response.data.data.find(b => b.user_id === envId);
        if (browser && browser.last_url) {
          return browser.last_url;
        }
      }
      
      // 如果没有找到URL，也不抛出错误，只返回null
      return null;
    } catch (error) {
      console.error(`获取环境最后URL失败 (${envId}):`, error.message);
      return null; // 返回null而不是抛出错误，这样调用者可以优雅地处理
    }
  }

  /**
   * 获取单个环境的详细信息
   * @param {string} envId 环境ID
   * @returns {Promise<Object>} 环境详情
   */
  async getEnvironmentDetails(envId) {
    if (!envId) {
      console.error('获取环境详情失败：环境ID不能为空');
      return { code: -1, msg: '环境ID不能为空' };
    }
    
    try {
      console.log(`正在获取环境 ${envId} 的详细信息...`);
      
      // 尝试通过用户ID获取环境详情
      const response = await this.getEnvironmentList({ page: 1, page_size: 100 });
      
      if (response.code === 0 && Array.isArray(response.data)) {
        // 在返回的环境列表中查找指定ID的环境
        const environment = response.data.find(env => 
          env.user_id === envId || env.id === envId || env.serial_number === envId
        );
        
        if (environment) {
          console.log(`已找到环境 ${envId} 的详细信息`);
          return {
            code: 0,
            msg: '成功获取环境详情',
            data: environment
          };
        } else {
          console.warn(`未找到环境 ${envId} 的详细信息`);
          return {
            code: 404,
            msg: `未找到环境 ${envId}`,
            data: null
          };
        }
      } else {
        console.error(`获取环境列表失败:`, response.msg || '未知错误');
        return response;
      }
    } catch (error) {
      console.error(`获取环境 ${envId} 详情失败:`, error.message);
      return {
        code: -1,
        msg: `获取环境详情失败: ${error.message}`,
        data: null
      };
    }
  }

  /**
   * 更新API基础URL
   * @param {string} baseUrl - 新的API基础URL
   */
  updateBaseUrl(baseUrl) {
    if (!baseUrl) {
      console.warn('警告: 尝试设置空的AdsPower API基础URL');
      return;
    }
    
    console.log(`正在更新AdsPower API基础URL: ${baseUrl}`);
    this.baseUrl = baseUrl;
    
    // 更新axios客户端配置
    this.client.defaults.baseURL = baseUrl;
    
    // 重置连接状态
    this.isRunning = false;
    
    console.log('AdsPower API基础URL已更新');
  }
}

module.exports = AdsPowerAPI;

