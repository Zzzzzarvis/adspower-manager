// Browser Use API 模块 - 负责与Browser Use WebUI API交互
const axios = require('axios');
const logger = require('./logger');
const AdsPowerAPI = require('./adspower-api');

class BrowserUseAPI {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://127.0.0.1:7788/api';
    this.timeout = options.timeout || 120000; // 2分钟超时
    this.adspowerApi = options.adspowerApi || new AdsPowerAPI();
  }

  /**
   * 执行基本请求
   * @param {string} endpoint - API端点
   * @param {object} data - 请求数据
   * @returns {Promise} - API响应
   */
  async request(endpoint, data = {}) {
    try {
      const url = `${this.baseUrl}/${endpoint}`;
      logger.debug(`向Browser Use API发送请求: POST ${url}`);
      
      const response = await axios.post(url, data, {
        headers: { 'Content-Type': 'application/json' },
        timeout: this.timeout
      });
      
      return response.data;
    } catch (error) {
      const errorMsg = error.response ? 
        `状态码: ${error.response.status}, 消息: ${error.response.data?.error || error.message}` : 
        error.message;
      
      logger.error(`Browser Use API请求失败: ${endpoint} - ${errorMsg}`);
      throw new Error(`Browser Use API请求失败: ${errorMsg}`);
    }
  }

  /**
   * 运行自动化任务
   * @param {object} params - 任务参数
   * @returns {Promise} - 任务结果
   */
  async runTask(params) {
    const defaultParams = {
      use_vision: true,
      llm_provider: 'openai',
      llm_model_name: 'gpt-4o',
      save_recording: false,
      save_recording_path: '',
      continue_task_id: '',
      browser_port: 0,
      proxy: '',
      timeout: 300, // 5分钟超时
      chrome_path: ''
    };

    // 合并默认参数和用户参数
    const taskParams = { ...defaultParams, ...params };
    
    if (!taskParams.task) {
      throw new Error('未指定任务描述');
    }

    // 特殊处理DeepSeek模型
    if (taskParams.llm_provider === 'deepseek') {
      taskParams.use_vision = false;
    }

    logger.info(`启动Browser Use任务: ${taskParams.task.substring(0, 50)}${taskParams.task.length > 50 ? '...' : ''}`);
    return this.request('run_task', taskParams);
  }

  /**
   * 停止当前运行的任务
   * @returns {Promise} - 停止结果
   */
  async stopTask() {
    logger.info('停止Browser Use任务');
    return this.request('stop_task');
  }

  /**
   * 关闭浏览器
   * @returns {Promise} - 关闭结果
   */
  async closeBrowser() {
    logger.info('关闭Browser Use浏览器');
    return this.request('close_browser');
  }

  /**
   * 执行深度网络搜索
   * @param {object} params - 搜索参数
   * @returns {Promise} - 搜索结果
   */
  async runDeepSearch(params) {
    const defaultParams = {
      research_task: '',
      llm_provider: 'openai',
      llm_model_name: 'gpt-4o',
      browser_port: 0,
      proxy: '',
      timeout: 180 // 3分钟超时
    };

    // 合并默认参数和用户参数
    const searchParams = { ...defaultParams, ...params };
    
    if (!searchParams.research_task) {
      throw new Error('未指定研究任务');
    }

    logger.info(`启动深度搜索: ${searchParams.research_task.substring(0, 50)}${searchParams.research_task.length > 50 ? '...' : ''}`);
    return this.request('run_deep_search', searchParams);
  }

  /**
   * 获取录制列表
   * @param {string} path - 保存录制的路径
   * @returns {Promise} - 录制列表
   */
  async listRecordings(path) {
    logger.info(`获取录制列表: ${path}`);
    return this.request('list_recordings', { save_recording_path: path });
  }

  /**
   * 集成AdsPower运行Browser Use任务
   * @param {string} envId - AdsPower环境ID
   * @param {string} task - 任务描述
   * @param {object} options - 其他选项
   * @returns {Promise} - 任务结果
   */
  async runWithAdsPower(envId, task, options = {}) {
    if (!envId) {
      throw new Error('未指定AdsPower环境ID');
    }
    
    if (!task) {
      throw new Error('未指定任务描述');
    }

    try {
      // 1. 启动AdsPower浏览器
      logger.info(`通过AdsPower启动Browser Use任务 (环境: ${envId})`);
      const startResult = await this.adspowerApi.startBrowser(envId);
      
      if (!startResult || !startResult.data || !startResult.data.ws) {
        throw new Error('启动AdsPower浏览器失败: 未返回WebSocket URL');
      }
      
      // 2. 获取WebSocket URL
      const wsEndpoint = startResult.data.ws.puppeteer;
      if (!wsEndpoint) {
        throw new Error('启动AdsPower浏览器失败: 无效的WebSocket URL');
      }
      
      // 3. 获取浏览器端口号
      const port = this.extractPortFromWs(wsEndpoint);
      
      // 4. 运行Browser Use任务
      const taskParams = {
        task,
        browser_port: port,
        ...options
      };
      
      const result = await this.runTask(taskParams);
      
      // 5. 任务完成后根据选项决定是否关闭浏览器
      if (options.closeAfterComplete) {
        await this.adspowerApi.stopBrowser(envId);
      }
      
      return result;
    } catch (error) {
      logger.error(`通过AdsPower运行Browser Use任务失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 从WebSocket URL中提取端口号
   * @param {string} ws - WebSocket URL
   * @returns {number} - 端口号
   */
  extractPortFromWs(ws) {
    try {
      const urlObj = new URL(ws);
      return parseInt(urlObj.port, 10);
    } catch (error) {
      logger.error(`从WebSocket URL提取端口失败: ${error.message}`);
      return 0;
    }
  }
}

module.exports = BrowserUseAPI; 