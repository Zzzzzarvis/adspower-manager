// AdsPower多环境管理器 - 优化版本
const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const BrowserController = require('./lib/browser-controller');
const TaskRunner = require('./lib/task-runner');
const OpenAIClient = require('./lib/openai-client');
const DeepSeekClient = require('./deepseek-client');
const AdsPowerAPI = require('./lib/adspower-api');
const logger = require('./lib/logger');
const os = require('os');

// 初始化应用
const app = express();
const port = process.env.PORT || 3002; // 改为3002端口，避免与正在运行的进程冲突

// 中间件
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 设置视图引擎
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// 强制刷新静态资源
app.use(function(req, res, next) {
  // 如果是JS或CSS文件，设置缓存控制头
  if (req.url.match(/\.(js|css)$/)) {
    // 设置明确的无缓存头部
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // 添加一个随机查询参数，强制浏览器重新请求
    const timestamp = Date.now();
    if (req.url.indexOf('?') === -1) {
      req.url = req.url + '?v=' + timestamp;
    } else {
      req.url = req.url + '&v=' + timestamp;
    }
    
    console.log(`强制刷新静态资源: ${req.url}`);
  }
  next();
});

// 设置静态文件目录
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, path) => {
    // 对所有JS和CSS文件禁用缓存
    if (path.endsWith('.js') || path.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      
      // 添加随机版本号参数
      const version = Date.now();
      if (path.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
      } else if (path.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=UTF-8');
      }
    }
  }
}));

// 存储运行中的环境
const environments = {};
const activeTasks = {};
const stateManagers = {};

// 加载配置文件（如果存在）
let config = {};
try {
  const configPath = path.join(__dirname, 'config', 'config.json');
  console.log(`尝试加载配置文件: ${configPath}`);
  if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf8');
    console.log(`配置文件内容长度: ${configContent.length}字节`);
    config = JSON.parse(configContent);
    console.log('已加载配置文件');
    console.log(`OpenAI API密钥配置: ${config.openaiApiKey ? '存在(长度:'+config.openaiApiKey.length+')' : '不存在'}`);
    console.log(`DeepSeek API密钥配置: ${config.deepseekApiKey ? '存在(长度:'+config.deepseekApiKey.length+')' : '不存在'}`);
    console.log(`AdsPower端口配置: ${config.adsPowerPort || '未设置 (使用默认值50325)'}`);
  } else {
    console.log('配置文件不存在，使用默认配置');
  }
} catch (error) {
  console.error('加载配置文件失败:', error);
}

// 从配置文件获取API密钥和URL，如果不存在则使用环境变量或默认值
const OPENAI_API_KEY = config.openaiApiKey || process.env.OPENAI_API_KEY || '';
const OPENAI_API_URL = config.openaiApiUrl || process.env.OPENAI_API_URL || 'https://api.openai.com';
const DEEPSEEK_API_KEY = config.deepseekApiKey || process.env.DEEPSEEK_API_KEY || '';
const ADS_POWER_PORT = config.adsPowerPort || process.env.ADS_POWER_PORT || 50325;

console.log(`最终使用的OpenAI API密钥: ${OPENAI_API_KEY ? '已设置(长度:'+OPENAI_API_KEY.length+')' : '未设置'}`);
console.log(`最终使用的DeepSeek API密钥: ${DEEPSEEK_API_KEY ? '已设置(长度:'+DEEPSEEK_API_KEY.length+')' : '未设置'}`);
console.log(`最终使用的AdsPower端口: ${ADS_POWER_PORT}`);

// 设置端口
const PORT = config.port || process.env.PORT || 3002;

// OpenAI API配置
const openaiClient = new OpenAIClient({
  apiKey: OPENAI_API_KEY,
  baseUrl: OPENAI_API_URL
});

// 在OpenAI客户端初始化后添加日志
console.log(`OpenAI客户端初始化${openaiClient.isConfigured() ? '成功' : '失败'}`);

// DeepSeek API配置
const deepseekClient = new DeepSeekClient(DEEPSEEK_API_KEY);

// AdsPower API客户端
const adspowerApi = new AdsPowerAPI({
  baseUrl: `http://localhost:${ADS_POWER_PORT}/api/v1`
});

// 环境备注文件路径
const notesFilePath = path.join(__dirname, 'config', 'environment-notes.json');

/**
 * 检查AdsPower连接状态
 */
async function checkAdsPowerConnection() {
  console.log('\n正在检查AdsPower API连接状态...');
  
  try {
    // 尝试多种方式检查连接
    let connectionSuccess = false;
    let environmentCount = 0;
    
    // 方法1: 尝试获取分组列表
    console.log('方法1: 正在获取分组列表...');
    try {
      const groups = await adspowerApi.getGroups();
      if (groups && (groups.code === 0 || groups.status === 'success')) {
        console.log('✅ 分组列表获取成功');
        connectionSuccess = true;
      } else {
        console.log('分组列表获取失败');
      }
    } catch (groupError) {
      console.log('获取分组列表失败', groupError.message);
    }
    
    // 方法2: 尝试获取环境列表
    console.log('方法2: 正在获取环境列表...');
    try {
      const environmentsResult = await adspowerApi.getEnvironmentList({ page: 1, page_size: 100 });
      
      if (environmentsResult && environmentsResult.code === 0) {
        connectionSuccess = true;
        
        const envList = environmentsResult.data || [];
        environmentCount = envList.length;
        
        console.log(`环境列表获取成功，发现 ${environmentCount} 个环境`);
        
        if (environmentCount > 0) {
          // 加载环境备注
          loadEnvironmentNotes();
        }
      } else {
        console.log('环境列表获取失败');
      }
    } catch (envsError) {
      console.log('获取环境列表出错', envsError.message);
    }
    
    // 方法3: 尝试使用curl测试
    if (!connectionSuccess) {
      console.log('方法3: 尝试使用curl测试连接...');
      try {
        const curlResult = await adspowerApi.testApiWithCurl();
        if (curlResult && curlResult.success) {
          connectionSuccess = true;
          console.log('curl测试成功');
          
          if (curlResult.environments) {
            environmentCount = curlResult.environments.length;
            console.log(`curl测试发现 ${environmentCount} 个环境`);
          }
        } else {
          console.log('curl测试失败');
        }
      } catch (curlError) {
        console.log('curl测试出错', curlError.message);
      }
    }
    
    // 检查AdsPower进程是否运行
    if (!connectionSuccess) {
      console.log('检查AdsPower进程是否运行...');
      
      try {
        const { execSync } = require('child_process');
        
        let command;
        if (process.platform === 'win32') {
          command = 'tasklist | findstr "AdsPower"';
        } else if (process.platform === 'darwin') {
          command = 'ps -ef | grep -i adspower | grep -v grep';
        } else {
          command = 'ps aux | grep -i adspower | grep -v grep';
        }
        
        const result = execSync(command, { encoding: 'utf8' });
        
        if (result && result.trim()) {
          console.log('AdsPower进程正在运行:');
          console.log(result.split('\n')[0]);
          console.log('但API连接仍然失败，请检查AdsPower API设置。');
        } else {
          console.log('❌ 未检测到AdsPower进程。请确保AdsPower已启动。');
        }
      } catch (error) {
        console.log('无法检查AdsPower进程', error.message);
      }
    }
    
    // 总结连接状态
    if (connectionSuccess) {
      console.log('✅ AdsPower API连接成功!');
      console.log(`发现 ${environmentCount} 个环境`);
      return true;
    } else {
      console.error('❌ AdsPower API连接失败。请确保AdsPower已启动且API可访问。');
      console.log('请检查以下可能的问题:');
      console.log('1. AdsPower软件是否已启动');
      console.log('2. AdsPower API是否已启用 (设置-高级设置-开发者选项)');
      console.log('3. API端口是否为默认的50325，或是否被其他程序占用');
      console.log('4. 防火墙或安全软件是否阻止了连接');
      
      return false;
    }
  } catch (error) {
    console.error('检查AdsPower连接失败:', error.message);
    return false;
  }
}

// 主页
app.get('/', async (req, res) => {
  try {
    // 检查API连接状态
    const isConnected = await checkAdsPowerConnection();
    
    // 加载分组
    let groups = [];
    if (isConnected) {
      const groupResponse = await adspowerApi.getGroups();
      if (groupResponse && groupResponse.data) {
        groups = groupResponse.data;
      }
    }
    
    // 检查是否有AI API配置
    const openaiConfigured = !!OPENAI_API_KEY;
    const deepseekConfigured = !!DEEPSEEK_API_KEY;
    
    // 渲染首页
    res.render('index', {
      title: 'AdsPower 多环境管理器',
      openaiConfigured,
      deepseekConfigured,
      groups,
      selectedGroup: req.query.group || '',
      adspower: { 
        connected: isConnected, 
        totalEnvironments: globalEnvironmentCount || 0
      }
    });
  } catch (error) {
    console.error('加载首页时出错:', error);
    res.render('index', {
      title: 'AdsPower 多环境管理器',
      error: `加载页面时出错: ${error.message}`,
      groups: [],
      openaiConfigured: false,
      deepseekConfigured: false,
      adspower: { connected: false }
    });
  }
});

// 旧版UI路由
app.get('/old-ui', async (req, res) => {
  try {
    // 获取分组
    let groups = [];
    try {
      const groupResponse = await adspowerApi.getGroups();
      if (groupResponse && groupResponse.data) {
        groups = groupResponse.data;
      }
    } catch (groupError) {
      console.error('获取分组列表失败:', groupError);
      // 继续渲染UI，使用空分组数组
    }
    
    // 检查AI API配置状态
    const openaiConfigured = !!OPENAI_API_KEY;
    const deepseekConfigured = !!DEEPSEEK_API_KEY;
    
    res.render('old-ui', {
      title: 'AdsPower 多环境管理器 - 旧版界面',
      groups,
      openaiConfigured,
      deepseekConfigured
    });
  } catch (error) {
    console.error('加载旧版UI时出错:', error);
    res.render('old-ui', {
      title: 'AdsPower 多环境管理器 - 旧版界面',
      groups: [],
      error: error.message,
      openaiConfigured: false,
      deepseekConfigured: false
    });
  }
});

/**
 * 获取环境备注信息
 * @param {string} envId 环境ID
 * @returns {string} 环境备注信息 
 */
function getEnvironmentNotes(envId) {
  try {
    // 如果环境备注已加载
    if (global.environmentNotes && global.environmentNotes[envId]) {
      return global.environmentNotes[envId];
    }
    return ''; // 没有备注则返回空字符串
  } catch (error) {
    console.log(`获取环境 ${envId} 备注失败:`, error.message);
    return '';
  }
}

/**
 * 加载所有环境备注
 */
function loadEnvironmentNotes() {
  try {
    if (!fs.existsSync(notesFilePath)) {
      console.log('环境备注文件不存在，创建新文件');
      fs.writeFileSync(notesFilePath, JSON.stringify({}), 'utf8');
      global.environmentNotes = {};
      return;
    }
    
    const notesData = fs.readFileSync(notesFilePath, 'utf8');
    global.environmentNotes = JSON.parse(notesData);
    console.log(`已加载 ${Object.keys(global.environmentNotes).length} 个环境备注`);
  } catch (error) {
    console.error('加载环境备注失败:', error);
    global.environmentNotes = {};
  }
}

// 加载任务模板
function loadTasks() {
  try {
    const tasksPath = path.join(__dirname, 'config', 'tasks.json');
    if (fs.existsSync(tasksPath)) {
      const data = fs.readFileSync(tasksPath, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('加载任务模板失败:', error);
    return [];
  }
}

// 浏览器状态管理器
class BrowserStateManager {
  constructor() {
    this.history = [];
    this.navigationHistory = [];
    this.clickedElements = new Set();
    this.lastClickTime = 0;
  }

  recordNavigation(url) {
    this.navigationHistory.push({
      url,
      timestamp: Date.now()
    });
  }
  
  recordClick(selector) {
    this.clickedElements.add(selector);
    this.lastClickTime = Date.now();
    this.history.push({
      type: 'click',
      selector,
      timestamp: this.lastClickTime
    });
  }
  
  getLastNavigation() {
    if (this.navigationHistory.length === 0) return null;
    return this.navigationHistory[this.navigationHistory.length - 1];
  }
  
  hasClickedElement(selector) {
    return this.clickedElements.has(selector);
  }
  
  getTimeSinceLastClick() {
    if (this.lastClickTime === 0) return null;
    return Date.now() - this.lastClickTime;
  }
}

// 重新连接浏览器
async function reconnectBrowser(envId) {
  if (!environments[envId]) {
    return {
      success: false,
      error: `环境 ${envId} 不存在`
    };
  }
  
  console.log(`[${new Date().toLocaleTimeString()}] 尝试重新连接环境 ${envId}...`);
  
  // 更新重连计数
  environments[envId].reconnectCount = (environments[envId].reconnectCount || 0) + 1;
  
  // 获取新的WebSocket URL
  try {
    const response = await axios.get(`http://localhost:50325/api/v1/browser/start?user_id=${envId}&launch_args=["--no-sandbox"]`);
    
    if (response.data.code !== 0 || !response.data.data || !response.data.data.ws) {
      const errorMsg = `重新连接环境失败: ${response.data.msg || '未知错误'}`;
      console.error(`[${new Date().toLocaleTimeString()}] ${errorMsg}`);
      return {
        success: false,
        error: errorMsg
      };
    }
    
    const ws = response.data.data.ws;
    
    // 创建新的控制器
    const newController = new BrowserController();
    await newController.connect(ws);
    
    // 保存旧的URL
    const lastUrl = environments[envId].lastUrl;
    
    // 更新环境信息
    environments[envId].controller = newController;
    environments[envId].startTime = new Date();
    
    // 如果有上次访问的URL，尝试导航到该URL
    if (lastUrl) {
      try {
        console.log(`[${new Date().toLocaleTimeString()}] 尝试恢复上次URL: ${lastUrl}`);
        await newController.navigate(lastUrl);
        environments[envId].lastUrl = lastUrl;
      } catch (navError) {
        console.error(`[${new Date().toLocaleTimeString()}] 恢复URL失败:`, navError);
      }
    }
    
    console.log(`[${new Date().toLocaleTimeString()}] 环境 ${envId} 重新连接成功`);
    return {
      success: true
    };
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] 重新连接环境 ${envId} 失败:`, error);
    return {
      success: false,
      error: error.message || '未知错误'
    };
  }
}

// 启动环境
app.post('/api/environments/:envId/start', async (req, res) => {
  const envId = req.params.envId;
  
  try {
    console.log(`接收到启动环境 ${envId} 的请求`);
    
    // 检查环境是否已经在运行
    if (environments[envId] && environments[envId].controller) {
      // 广播环境状态更新
      app.emit('environment_update', {
        id: envId,
        status: 'running',
        lastUrl: environments[envId].lastUrl || null,
        startTime: environments[envId].startTime || new Date()
      });
      
      return res.json({
        success: true,
        message: `环境 ${envId} 已经在运行中`,
        connection: environments[envId].is_running || {
          connected: true,
          status: 'connected',
          timestamp: Date.now()
        }
      });
    }
    
    // 使用AdsPower API启动浏览器
    const startResponse = await adspowerApi.startBrowser(envId);
    
    console.log("启动环境原始响应:", JSON.stringify(startResponse));
    
    // 首先检查API响应是否成功
    if (startResponse.code === 0) {
      console.log(`环境 ${envId} API启动成功，尝试获取WebSocket连接...`);
      
      // 尝试获取WebSocket连接信息 - 考虑多种可能的响应格式
      let wsEndpoint = null;
      
      // 情况1: 直接在data.ws.puppeteer中有WebSocket URL
      if (startResponse.data && startResponse.data.ws && startResponse.data.ws.puppeteer) {
        wsEndpoint = startResponse.data.ws.puppeteer;
        console.log(`从data.ws.puppeteer获取到WebSocket地址: ${wsEndpoint}`);
      } 
      // 情况2: 在ws.puppeteer中有WebSocket URL (没有data层级)
      else if (startResponse.ws && startResponse.ws.puppeteer) {
        wsEndpoint = startResponse.ws.puppeteer;
        console.log(`从ws.puppeteer获取到WebSocket地址: ${wsEndpoint}`);
      }
      
      if (wsEndpoint) {
        try {
          // 创建并初始化浏览器控制器
          const controller = new BrowserController(wsEndpoint, envId);
          await controller.initialize();
          
          // 创建连接信息对象
          const connectionInfo = {
            connected: true,
            status: 'connected',
            websocket: wsEndpoint,
            controllerExists: true,
            timestamp: Date.now()
          };
          
          // 保存环境信息
          environments[envId] = {
            controller,
            startTime: new Date(),
            reconnectCount: 0,
            notes: environments[envId]?.notes || '',
            is_running: connectionInfo
          };
          
          console.log(`环境 ${envId} 已成功启动并连接WebSocket`);
          
          // 广播环境状态更新
          app.emit('environment_update', {
            id: envId,
            status: 'running',
            lastUrl: null,
            startTime: environments[envId].startTime,
            is_running: connectionInfo
          });
          
          // 返回成功响应
          return res.json({
            success: true,
            message: `环境 ${envId} 已成功启动`,
            hasWebSocket: true,
            connection: connectionInfo
          });
        } catch (wsError) {
          console.error(`连接WebSocket失败: ${wsError.message}`);
          
          // 创建有限连接信息对象
          const connectionInfo = {
            connected: false,
            status: 'error',
            error: wsError.message,
            timestamp: Date.now()
          };
          
          // WebSocket连接失败，但API启动成功，也视为启动成功
          // 保存环境信息（无控制器）
          environments[envId] = {
            controller: null,
            startTime: new Date(),
            notes: environments[envId]?.notes || '',
            status: 'running',
            is_running: connectionInfo
          };
          
          return res.json({
            success: true,
            message: '环境已在AdsPower中启动，但无法通过WebSocket控制',
            hasWebSocket: false,
            error: wsError.message,
            connection: connectionInfo
          });
        }
      } else {
        console.log(`环境 ${envId} 启动成功，但无法获取WebSocket地址`);
        
        // 没有WebSocket地址，但API启动成功，也视为启动成功
        // 保存环境信息（无控制器）
        environments[envId] = {
          controller: null,
          startTime: new Date(),
          notes: environments[envId]?.notes || '',
          status: 'running'
        };
        
        return res.json({
          success: true,
          message: '环境已在AdsPower中启动，但无法通过WebSocket控制',
          hasWebSocket: false
        });
      }
    } else {
      // API启动失败
      const errorMsg = startResponse.msg || '未知原因';
      console.error(`环境 ${envId} API启动失败: ${errorMsg}`);
      throw new Error(`启动环境失败: ${errorMsg}`);
    }
  } catch (error) {
    console.error(`启动环境 ${envId} 失败:`, error);
    res.status(500).json({
      success: false,
      message: `启动环境 ${envId} 失败: ${error.message}`
    });
  }
});

// 保留当前的启动环境API端点，确保后向兼容性
app.post('/api/environment/start/:envId', async (req, res) => {
  const envId = req.params.envId;
  
  console.log(`收到请求: 启动环境 ${envId}`);
  
  try {
    // 检查环境是否已经在运行
    if (environments[envId] && environments[envId].controller && environments[envId].controller.browser) {
      try {
        // 尝试验证浏览器是否真的连接
        const isConnected = environments[envId].controller.browser.isConnected();
        
        if (isConnected) {
          console.log(`环境 ${envId} 已经在运行中`);
          
          // 获取当前页面URL作为附加信息
          let currentUrl = '';
          try {
            currentUrl = await environments[envId].controller.page.url();
          } catch (urlError) {
            console.error('获取当前页面URL失败:', urlError);
          }
          
          // 刷新环境的最后一次活动时间
          environments[envId].lastActivity = Date.now();
          
          return res.json({
            success: true,
            message: '环境已经在运行中',
            alreadyRunning: true,
            wsEndpoint: environments[envId].wsEndpoint,
            hasWebSocket: true,
            currentUrl: currentUrl
          });
        } else {
          console.log(`环境 ${envId} 浏览器连接已断开，重新启动...`);
          // 断开连接的情况，尝试关闭现有浏览器
          try {
            await environments[envId].controller.close();
          } catch (closeError) {
            console.error('关闭断开连接的浏览器失败:', closeError);
          }
          // 继续启动新的浏览器实例
        }
      } catch (connectionError) {
        console.error(`检查环境 ${envId} 连接状态失败:`, connectionError);
        // 继续启动新的浏览器实例
      }
    }
    
    console.log(`正在请求AdsPower启动环境 ${envId}...`);
    
    const apiResponse = await adspowerApi.startBrowser(envId);
    
    if (apiResponse.code !== 0) {
      console.error(`启动环境 ${envId} 失败:`, apiResponse);
      return res.json({
        success: false,
        message: `启动环境失败: ${apiResponse.msg || '未知错误'}`
      });
    }
    
    const wsEndpoint = apiResponse.data?.ws;
    
    if (!wsEndpoint) {
      console.error(`无法获取环境 ${envId} 的WebSocket地址`);
      
      if (apiResponse.data?.open_tab) {
        // 如果AdsPower API返回open_tab但没有ws地址，表示浏览器已在AdsPower中打开，但我们无法通过WebSocket控制
        console.log(`环境 ${envId} 已在AdsPower中启动，但无WebSocket控制`);
        
        // 更新环境状态
        if (!environments[envId]) {
          environments[envId] = {};
        }
        environments[envId].startTime = new Date();
        environments[envId].lastActivity = Date.now();
        environments[envId].wsEndpoint = null;
        
        return res.json({
          success: true,
          message: '环境已在AdsPower中启动，但无法通过WebSocket控制',
          hasWebSocket: false
        });
      }
      
      return res.json({
        success: false,
        message: '无法获取环境的WebSocket地址'
      });
    }
    
    // 连接到浏览器
    try {
      console.log(`正在连接到环境 ${envId} 的WebSocket: ${wsEndpoint}`);
      
      const controller = new BrowserController();
      await controller.connect(wsEndpoint);
      
      // 保存环境信息
      if (!environments[envId]) {
        environments[envId] = {};
      }
      
      environments[envId].controller = controller;
      environments[envId].startTime = new Date();
      environments[envId].lastActivity = Date.now();
      environments[envId].wsEndpoint = wsEndpoint;
      
      console.log(`环境 ${envId} 连接成功`);
      
      res.json({
        success: true,
        message: '环境已启动并连接成功',
        wsEndpoint: wsEndpoint,
        hasWebSocket: true
      });
    } catch (error) {
      console.error(`连接到环境 ${envId} 的浏览器失败:`, error);
      
      res.json({
        success: false,
        message: `连接浏览器失败: ${error.message}`
      });
    }
  } catch (error) {
    console.error(`启动环境 ${envId} 时出错:`, error);
    
    res.json({
      success: false,
      message: `启动环境时出错: ${error.message}`
    });
  }
});

// 停止环境
app.post('/api/environments/:envId/stop', async (req, res) => {
  const envId = req.params.envId;
  
  try {
    console.log(`接收到停止环境 ${envId} 的请求`);
    
    // 检查环境是否存在
    if (!environments[envId]) {
      return res.status(404).json({
        success: false,
        message: `环境 ${envId} 不存在或未启动`
      });
    }
    
    // 断开浏览器连接
    if (environments[envId].controller) {
      try {
        // 检查是否有disconnect方法，或者尝试close方法
        if (typeof environments[envId].controller.disconnect === 'function') {
          await environments[envId].controller.disconnect();
        } else if (typeof environments[envId].controller.close === 'function') {
          await environments[envId].controller.close();
        } else {
          console.warn(`环境 ${envId} 的控制器没有disconnect或close方法`);
        }
      } catch (disconnectError) {
        console.error(`断开环境 ${envId} 连接时出错:`, disconnectError);
        // 继续处理，尝试通过API停止
      }
    }
    
    // 使用AdsPower API停止浏览器
    await adspowerApi.stopBrowser(envId);
    
    // 保留环境备注但移除控制器
    const notes = environments[envId].notes;
    environments[envId] = { notes };
    
    console.log(`环境 ${envId} 已成功停止`);
    
    // 返回成功响应
    res.json({
      success: true,
      message: `环境 ${envId} 已成功停止`
    });
  } catch (error) {
    console.error(`停止环境 ${envId} 失败:`, error);
    res.status(500).json({
      success: false,
      message: `停止环境 ${envId} 失败: ${error.message}`
    });
  }
});

// 元素探索器页面路由 - 直接集成到主应用
app.get('/element-explorer/:envId', async (req, res) => {
  const envId = req.params.envId;
  
  if (!environments[envId] || !environments[envId].controller) {
    return res.status(404).send(`环境 ${envId} 未运行，无法打开元素探索器`);
  }
  
  res.render('element-explorer', { envId });
});

// 截图API
app.get('/api/element-explorer/:envId/screenshot', async (req, res) => {
  try {
    const envId = req.params.envId;
    const forceRefresh = req.query.forceRefresh === 'true'; // 从查询参数获取是否强制刷新
    const useActiveTab = req.query.useActiveTab !== 'false'; // 默认使用活跃标签
    const tabId = req.query.tabId !== undefined ? parseInt(req.query.tabId) : undefined;
    
    // 检查环境是否存在
    if (!environments[envId]) {
      return res.json({ 
        success: false, 
        message: '找不到指定的环境' 
      });
    }
    
    // 检查环境是否有controller
    if (!environments[envId].controller) {
      return res.json({ 
        success: false, 
        message: '环境未启动或未正确连接' 
      });
    }
    
    console.log(`获取环境 ${envId} 的截图，强制刷新: ${forceRefresh}，使用活跃标签: ${useActiveTab}，标签ID: ${tabId}`);
    
    const controller = environments[envId].controller;
    
    // 如果指定了标签ID，先切换到该标签
    if (tabId !== undefined) {
      try {
        await controller.switchToPage(tabId);
        console.log(`已切换到标签页 ${tabId}`);
      } catch (switchError) {
        console.error('切换标签页失败:', switchError);
        // 继续使用当前标签
      }
    }
    
    // 获取截图 - 使用screenshot方法而不是getScreenshot
    const screenshot = await controller.screenshot({
      type: 'jpeg',
      quality: 70,
      fullPage: false,
      encoding: 'base64',
      forceRefresh: forceRefresh, // 传递强制刷新选项
      useActiveTab: useActiveTab   // 传递使用活跃标签选项
    });
    
    // 获取当前URL - 使用getCurrentUrl方法
    let url = '';
    try {
      url = await controller.getCurrentUrl();
    } catch (urlError) {
      console.error('获取URL失败:', urlError);
      url = '无法获取URL';
    }
    
    // 获取页面元素 - 使用getPageElements方法
    let elements = [];
    try {
      elements = await controller.getPageElements(false, useActiveTab); // 不需要再次强制刷新
    } catch (elemError) {
      console.error('获取页面元素失败:', elemError);
      elements = [];
    }
    
    // 获取所有标签页
    let tabs = [];
    try {
      tabs = await controller.getPages();
    } catch (tabsError) {
      console.error('获取标签页列表失败:', tabsError);
    }
    
    return res.json({
      success: true,
      screenshot: `data:image/jpeg;base64,${screenshot}`,
      url: url,
      elements: elements,
      tabs: tabs,
      message: '获取截图成功'
    });
  } catch (error) {
    console.error('获取截图失败:', error);
    return res.json({
      success: false,
      message: '获取截图失败: ' + error.message
    });
  }
});

// URL API
app.get('/api/element-explorer/:envId/url', async (req, res) => {
  try {
    const envId = req.params.envId;
    const useActiveTab = req.query.useActiveTab !== 'false'; // 默认使用活跃标签
    
    // 检查环境是否存在
    if (!environments[envId]) {
      return res.json({ 
        success: false, 
        message: '找不到指定的环境' 
      });
    }
    
    // 检查环境是否有controller
    if (!environments[envId].controller) {
      return res.json({ 
        success: false, 
        message: '环境未启动或未正确连接' 
      });
    }
    
    console.log(`获取环境 ${envId} 的URL，使用活跃标签: ${useActiveTab}`);
    
    const controller = environments[envId].controller;
    
    // 如果使用活跃标签，先切换到活跃标签
    if (useActiveTab) {
      try {
        await controller.getActiveTab();
      } catch (tabError) {
        console.warn(`切换到活跃标签失败: ${tabError.message}`);
        // 继续使用当前标签
      }
    }
    
    // 获取当前URL
    const url = await controller.getCurrentUrl();
    
    return res.json({
      success: true,
      url: url,
      message: '获取URL成功'
    });
  } catch (error) {
    console.error('获取URL失败:', error);
    return res.json({
      success: false,
      message: '获取URL失败: ' + error.message
    });
  }
});

// 元素API
app.get('/api/element-explorer/:envId/elements', async (req, res) => {
  const envId = req.params.envId;
  const forceRefresh = req.query.forceRefresh === 'true';
  const useActiveTab = req.query.useActiveTab === 'true';
  const tabId = req.query.tabId ? parseInt(req.query.tabId) : null;
  
  console.log(`API: 获取页面元素, 环境ID: ${envId}, 强制刷新: ${forceRefresh}, 使用活跃标签: ${useActiveTab}, 标签ID: ${tabId}`);
  
  try {
    // 检查环境是否存在
    if (!environments[envId]) {
      return res.json({ success: false, message: '环境不存在' });
    }
    
    const controller = environments[envId].controller;
    
    // 检查控制器是否已连接
    if (!controller || !controller.isConnected()) {
      return res.json({ success: false, message: '浏览器控制器未连接' });
    }
    
    // 获取页面元素
    const elements = await controller.getPageElements(forceRefresh, useActiveTab, tabId);
    
    // 获取当前URL
    const currentUrl = await controller.getCurrentUrl();
    console.log(`环境 ${envId} 当前URL: ${currentUrl}, 获取到 ${elements.length} 个元素`);
    
    // 根据元素的特性进行分类和标记
    const processedElements = elements.map(el => {
      // 识别小型可点击元素
      const isSmallClickable = (el.rect.width < 40 || el.rect.height < 40) && (
        el.tagName === 'a' || 
        el.tagName === 'button' || 
        el.clickable || 
        (el.attributes && (
          el.attributes.role === 'button' ||
          (el.attributes.class && (/icon|btn/i.test(el.attributes.class)))
        ))
      );
      
      // 为小型可点击元素添加标记
      if (isSmallClickable) {
        el.isSmallClickable = true; 
      }
      
      return el;
    });
    
    return res.json({ 
      success: true, 
      elements: processedElements,
      url: currentUrl
    });
  } catch (error) {
    console.error(`获取页面元素失败: ${error.message}`);
    res.json({ success: false, message: `获取元素失败: ${error.message}` });
  }
});

// 重新连接环境的API
app.post('/api/browser/reconnect/:envId', async (req, res) => {
  try {
    const envId = req.params.envId;
    
    // 检查环境是否存在
    if (!environments[envId]) {
      console.error(`尝试重新连接不存在的环境: ${envId}`);
      return res.json({
        success: false,
        message: '环境不存在'
      });
    }
    
    console.log(`尝试重新连接环境: ${envId}`);
    
    // 先关闭现有连接
    if (environments[envId].controller) {
      try {
        await environments[envId].controller.close();
        console.log(`已关闭环境 ${envId} 的现有连接`);
      } catch (closeError) {
        console.error(`关闭环境 ${envId} 时出错:`, closeError);
        // 继续尝试重新连接
      }
    }
    
    // 使用AdsPower API重新启动浏览器
    try {
      // 使用AdsPower API启动浏览器
      const startResponse = await adspowerApi.startBrowser(envId);
      
      console.log("重新连接环境原始响应:", JSON.stringify(startResponse));
      
      // 首先检查API响应是否成功
      if (startResponse.code === 0) {
        console.log(`环境 ${envId} API重启成功，尝试获取WebSocket连接...`);
        
        // 尝试获取WebSocket连接信息
        let wsEndpoint = null;
        
        // 情况1: 直接在data.ws.puppeteer中有WebSocket URL
        if (startResponse.data && startResponse.data.ws && startResponse.data.ws.puppeteer) {
          wsEndpoint = startResponse.data.ws.puppeteer;
          console.log(`从data.ws.puppeteer获取到WebSocket地址: ${wsEndpoint}`);
        } 
        // 情况2: 在ws.puppeteer中有WebSocket URL (没有data层级)
        else if (startResponse.ws && startResponse.ws.puppeteer) {
          wsEndpoint = startResponse.ws.puppeteer;
          console.log(`从ws.puppeteer获取到WebSocket地址: ${wsEndpoint}`);
        }
        
        if (wsEndpoint) {
          try {
            // 创建并初始化浏览器控制器
            const controller = new BrowserController(wsEndpoint, envId);
            await controller.initialize();
            
            // 更新环境信息
            environments[envId].controller = controller;
            environments[envId].startTime = new Date();
            environments[envId].reconnectCount = (environments[envId].reconnectCount || 0) + 1;
            environments[envId].is_running = {
              connected: true,
              status: 'connected',
              websocket: wsEndpoint,
              controllerExists: true,
              timestamp: Date.now()
            };
            
            console.log(`环境 ${envId} 重新连接成功`);
            
            return res.json({
              success: true,
              message: '环境重新连接成功'
            });
          } catch (error) {
            console.error(`连接到浏览器失败:`, error);
            return res.json({
              success: false,
              message: `连接到浏览器失败: ${error.message}`
            });
          }
        } else {
          console.error('无法获取WebSocket地址');
          return res.json({
            success: false,
            message: '无法获取WebSocket地址'
          });
        }
      } else {
        console.error(`AdsPower API启动失败: ${startResponse.msg || JSON.stringify(startResponse)}`);
        return res.json({
          success: false,
          message: `AdsPower API启动失败: ${startResponse.msg || JSON.stringify(startResponse)}`
        });
      }
    } catch (startError) {
      console.error(`调用AdsPower API启动浏览器失败:`, startError);
      return res.json({
        success: false,
        message: `调用AdsPower API启动浏览器失败: ${startError.message}`
      });
    }
  } catch (error) {
    console.error('重新连接环境时出错:', error);
    return res.json({
      success: false,
      message: '重新连接环境时出错: ' + error.message
    });
  }
});

// 新增元素检查器主入口API，方便前端调用
app.get('/api/environments/:envId/inspector', async (req, res) => {
  const envId = req.params.envId;
  
  try {
    // 检查环境是否运行
    if (!environments[envId] || !environments[envId].controller) {
      return res.status(200).json({
        success: false,
        available: false,
        message: `环境 ${envId} 未运行或控制器未初始化`,
        inspectorUrl: null
      });
    }
    
    // 生成元素检查器URL
    const inspectorUrl = `/element-explorer/${envId}`;
    
    // 返回检查器URL和状态
    res.json({
      success: true,
      available: true,
      message: '元素检查器可用',
      inspectorUrl: inspectorUrl
    });
  } catch (error) {
    console.error(`获取环境 ${envId} 元素检查器状态失败:`, error);
    res.status(500).json({
      success: false,
      message: `获取元素检查器状态失败: ${error.message}`
    });
  }
});

// 获取页面元素
app.get('/api/element-explorer/:envId/page-elements', async (req, res) => {
  const envId = req.params.envId;
  
  console.log(`获取环境 ${envId} 的页面元素`);
  
  try {
    // 检查环境是否存在并运行
    if (!environments[envId] || !environments[envId].controller || !environments[envId].controller.page) {
      return res.json({
        success: false,
        message: '环境未运行或浏览器未连接'
      });
    }
    
    const controller = environments[envId].controller;
    
    try {
      // 使用超时保护
      const pageOperationWithTimeout = async (operation, timeoutMs, errorMessage) => {
        return Promise.race([
          operation(),
          new Promise((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs))
        ]);
      };
      
      // 获取页面元素
      const elements = await pageOperationWithTimeout(
        async () => {
          return controller.page.evaluate(() => {
            // 收集页面上所有可交互元素
            try {
              const selectors = [
                'a', 'button', '[role="button"]', 'input', 'select', 'textarea', '[tabindex]',
                '[onclick]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
                '[role="tab"]', '[role="menu"]', '[role="menuitem"]', '[role="option"]',
                'area[href]', 'summary', 'details', '[contenteditable="true"]',
                'iframe', 'label', '.clickable', '[class*="btn"]', '[class*="button"]'
              ];
              
              // 查找所有匹配的元素
              const allElements = document.querySelectorAll(selectors.join(','));
              const elements = Array.from(allElements).slice(0, 200);
              
              // 过滤可见元素
              return elements
                .filter(el => {
                  try {
                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);
                    return rect.width > 3 && rect.height > 3 && 
                          style.display !== 'none' && 
                          style.visibility !== 'hidden' && 
                          style.opacity !== '0' &&
                          el.offsetParent !== null;
                  } catch (e) {
                    return false;
                  }
                })
                .map((el, id) => {
                  try {
                    const rect = el.getBoundingClientRect();
                    
                    // 获取元素文本
                    let text = el.innerText || el.textContent || '';
                    if (!text && el.value) text = el.value;
                    if (!text && el.placeholder) text = '(占位符: ' + el.placeholder + ')';
                    if (!text && el.alt) text = '(alt: ' + el.alt + ')';
                    if (!text && el.title) text = '(title: ' + el.title + ')';
                    
                    // 构建选择器
                    let selector = '';
                    if (el.id) {
                      selector = `#${CSS.escape(el.id)}`;
                    } else {
                      selector = el.tagName.toLowerCase();
                    }
                    
                    return {
                      id,
                      tagName: el.tagName.toLowerCase(),
                      text: text.trim().substring(0, 50),
                      selector,
                      rect: {
                        x: rect.left,
                        y: rect.top,
                        width: rect.width,
                        height: rect.height
                      }
                    };
                  } catch (e) {
                    return null;
                  }
                })
                .filter(Boolean);
            } catch (e) {
              console.error('获取元素错误:', e);
              return [];
            }
          });
        },
        10000,
        '获取页面元素超时'
      );
      
      console.log(`获取到 ${elements.length} 个页面元素`);
      
      res.json({
        success: true,
        elements: elements
      });
    } catch (error) {
      console.error(`获取页面元素失败:`, error);
      
      res.json({
        success: false,
        message: `获取页面元素失败: ${error.message}`
      });
    }
  } catch (error) {
    console.error(`处理获取页面元素请求时出错:`, error);
    
    res.json({
      success: false,
      message: `处理请求出错: ${error.message}`
    });
  }
});

/**
 * 生成模拟环境数据
 * 在AdsPower不可用时提供测试数据
 */
function generateMockEnvironments() {
  console.log('生成模拟环境数据...');
  
  const mockEnvironments = [];
  const count = 10; // 模拟10个环境
  
  for (let i = 1; i <= count; i++) {
    const isRunning = i <= 3; // 前3个为运行状态
    const envId = `mock-${100000 + i}`;
    
    // 创建一致格式的is_running值
    let isRunningValue = false;
    if (isRunning) {
      isRunningValue = {
        connected: true,
        status: 'connected',
        controllerExists: true,
        timestamp: Date.now(),
        websocket: `ws://mockhost:${50000 + i}/browser/mock-session-${i}`
      };
    }
    
    mockEnvironments.push({
      user_id: envId,
      name: `测试环境 ${i}`,
      serial_number: `MOCK-${i}`,
      group_name: i % 3 === 0 ? '测试分组A' : (i % 3 === 1 ? '测试分组B' : '测试分组C'),
      status: isRunning ? 'Active' : 'Inactive',
      is_running: isRunningValue,
      notes: `这是一个模拟环境，用于测试。编号: ${i}`,
      create_time: Math.floor(Date.now() / 1000) - (86400 * i)
    });
  }
  
  console.log(`已生成 ${mockEnvironments.length} 个模拟环境`);
  return mockEnvironments;
}

/**
 * 保存环境备注
 * @param {Object} notes 要保存的备注对象
 * @returns {boolean} 保存成功返回true，否则返回false
 */
function saveEnvironmentNotes(notes) {
  try {
    const configDir = path.dirname(notesFilePath);
    
    // 确保配置目录存在
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // 更新全局变量
    global.environmentNotes = notes;
    
    // 写入文件
    fs.writeFileSync(notesFilePath, JSON.stringify(notes, null, 2), 'utf8');
    console.log(`成功保存 ${Object.keys(notes).length} 个环境备注`);
    return true;
  } catch (error) {
    console.error('保存环境备注失败:', error);
    return false;
  }
}

// API路由：获取环境备注
app.get('/api/environments/:envId/note', (req, res) => {
  try {
    const envId = req.params.envId;
    
    // 确保环境备注已加载
    if (!global.environmentNotes) {
      loadEnvironmentNotes();
    }
    
    const note = getEnvironmentNotes(envId);
    
    res.json({
      success: true,
      note: note
    });
  } catch (error) {
    console.error(`获取环境 ${req.params.envId} 备注失败:`, error);
    res.status(500).json({
      success: false,
      message: `获取环境备注失败: ${error.message}`
    });
  }
});

// API路由：保存环境备注
app.post('/api/environments/:envId/note', (req, res) => {
  try {
    const envId = req.params.envId;
    const note = req.body.note || '';
    
    // 确保环境备注已加载
    if (!global.environmentNotes) {
      loadEnvironmentNotes();
    }
    
    // 更新备注
    global.environmentNotes[envId] = note;
    
    // 保存到文件
    const saved = saveEnvironmentNotes(global.environmentNotes);
    
    if (saved) {
      res.json({
        success: true,
        message: '环境备注已保存'
      });
    } else {
      res.status(500).json({
        success: false,
        message: '保存环境备注失败'
      });
    }
  } catch (error) {
    console.error(`保存环境 ${req.params.envId} 备注失败:`, error);
    res.status(500).json({
      success: false,
      message: `保存环境备注失败: ${error.message}`
    });
  }
});

// API状态检查
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    message: 'API服务器正常运行',
    time: new Date().toISOString(),
    apiBaseUrl: adspowerApi.baseUrl,
    environments: {
      apiAvailable: adspowerApi.isRunning,
      count: global.environmentCount || 0
    }
  });
});

// 获取环境列表
app.get('/api/environments', async (req, res) => {
  try {
    // 获取分组ID过滤参数
    const groupId = req.query.group_id || '';
    console.log(`获取环境列表，分组过滤: ${groupId ? groupId : '全部'}`);
    
    // 实现完整的环境列表获取功能
    console.time('获取环境列表');
    const options = { page: 1, page_size: 100 };
    if (groupId && groupId !== 'all') {
      options.group_id = groupId;
    }
    
    // 调用AdsPower API获取环境列表
    const apiResponse = await adspowerApi.getEnvironmentList(options);
    console.timeEnd('获取环境列表');
    
    console.log(`AdsPower API响应:`, JSON.stringify(apiResponse).slice(0, 200) + '...');
    
    // 检查API响应格式并正确提取环境列表
    let allEnvironments = [];
    
    if (apiResponse && apiResponse.code === 0) {
      // 从API响应中提取环境列表，处理多种可能的数据结构
      if (apiResponse.data && Array.isArray(apiResponse.data)) {
        // 直接数组结构
        allEnvironments = apiResponse.data;
      } else if (apiResponse.data && apiResponse.data.list && Array.isArray(apiResponse.data.list)) {
        // 标准AdsPower响应，带有list字段
        allEnvironments = apiResponse.data.list;
      } else if (apiResponse.data && typeof apiResponse.data === 'object') {
        // 尝试直接使用data对象
        allEnvironments = [apiResponse.data];
      }
      
      console.log(`成功从AdsPower API提取到 ${allEnvironments.length} 个环境`);
    } else {
      console.error(`AdsPower API返回错误:`, apiResponse?.msg || '未知错误');
      throw new Error(apiResponse?.msg || '调用AdsPower API失败');
    }
    
    // 全局保存环境数量，用于状态API
    global.environmentCount = allEnvironments.length;
    
    // 统计运行中的环境
    const runningEnvironments = Object.keys(environments).filter(id => 
      environments[id] && environments[id].controller).length;
    console.log(`运行中的环境: ${runningEnvironments}/${allEnvironments.length}`);
    
    // 增强环境数据，添加运行状态和备注信息
    const enhancedEnvironments = allEnvironments.map(env => {
      const envId = env.user_id || env.id || '';
      const isRunning = environments[envId] && environments[envId].controller ? true : false;
      
      return {
        ...env,
        id: envId,
        is_running: isRunning,
        notes: environments[envId]?.notes || ''
      };
    });
    
    // 返回响应
    console.log(`正在返回 ${enhancedEnvironments.length} 个环境到前端`);
    res.json({
      success: true,
      message: `成功获取 ${enhancedEnvironments.length} 个环境`,
      environments: enhancedEnvironments,
      running_count: runningEnvironments,
      total_count: allEnvironments.length
    });
  } catch (error) {
    console.error('获取环境列表失败:', error);
    res.status(500).json({
      success: false,
      message: `获取环境列表失败: ${error.message}`
    });
  }
});

// 启动服务器
const server = app.listen(PORT, async () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`OpenAI API URL: ${OPENAI_API_URL}`);
  console.log(`OpenAI API Key 配置状态: ${OPENAI_API_KEY ? '已配置' : '未配置'}`);
  console.log(`DeepSeek API Key 配置状态: ${DEEPSEEK_API_KEY ? '已配置' : '未配置'}`);
  
  // 初始化环境备注
  loadEnvironmentNotes();
  
  // 检查AdsPower API是否可用
  try {
    const apiStatus = await adspowerApi.checkApiStatus();
    if (apiStatus.available) {
      console.log(`已找到可用的AdsPower API: ${apiStatus.url}`);
    } else {
      console.warn(`警告: 未找到可用的AdsPower API，某些功能可能无法正常工作`);
    }
  } catch (error) {
    console.error('检查AdsPower API状态时出错:', error);
  }
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

// AI模型API端点
app.get('/api/ai/models', (req, res) => {
  try {
    // 定义可用的AI模型
    const models = [
      {
        id: 'openai',
        name: 'OpenAI GPT-4',
        description: 'OpenAI的GPT-4模型',
        status: OPENAI_API_KEY ? 'enabled' : 'disabled'
      },
      {
        id: 'deepseek',
        name: 'DeepSeek',
        description: 'DeepSeek AI模型',
        status: DEEPSEEK_API_KEY ? 'enabled' : 'disabled'
      }
    ];
    
    // 确定默认模型
    let defaultModelId = 'openai';
    if (!OPENAI_API_KEY && DEEPSEEK_API_KEY) {
      defaultModelId = 'deepseek';
    }
    
    res.json({
      success: true,
      models,
      defaultModelId
    });
  } catch (error) {
    console.error('获取AI模型列表失败:', error);
    res.status(500).json({
      success: false,
      message: `获取AI模型列表失败: ${error.message}`,
      models: []
    });
  }
});

// 执行AI命令
app.post('/api/ai/execute', async (req, res) => {
  try {
    const { command, envId, modelId } = req.body;
    
    // 验证参数
    if (!command) {
      return res.status(400).json({ success: false, message: '缺少命令参数' });
    }
    
    // 创建上下文信息，包括所选环境
    let context = '';
    if (envId) {
      // 检查环境是否在运行
      if (!environments[envId] || !environments[envId].controller) {
        return res.json({
          success: false,
          message: '环境未在运行中，请先启动环境'
        });
      }
      
      context = `当前环境ID: ${envId}`;
      
      // 如果有环境ID，尝试获取最后一个URL
      try {
        const lastUrl = await adspowerApi.getLastUrl(envId);
        if (lastUrl) {
          context += `\n当前环境最后一个URL: ${lastUrl}`;
        }
      } catch (error) {
        console.warn(`无法获取环境 ${envId} 的最后URL:`, error.message);
      }
    } else {
      context = '未指定环境，请生成可执行代码';
    }
    
    // 根据选择的模型调用不同的AI客户端
    let result = '';
    if (modelId === 'deepseek') {
      if (!config.deepseekApiKey) {
        return res.status(500).json({ success: false, message: 'DeepSeek API密钥未配置' });
      }
      
      console.log(`使用DeepSeek AI执行命令, 环境ID: ${envId || '无'}`);
      result = await deepseekClient.generateText(`${context}\n\n用户命令: ${command}`);
    } else {
      // 默认使用OpenAI
      if (!config.openaiApiKey) {
        return res.status(500).json({ success: false, message: 'OpenAI API密钥未配置' });
      }
      
      console.log(`使用OpenAI执行命令, 环境ID: ${envId || '无'}`);
      result = await openaiClient.generateCompletion(`${context}\n\n用户命令: ${command}`);
    }
    
    // 记录命令执行结果
    console.log(`AI命令执行成功，模型: ${modelId}, 环境ID: ${envId || '无'}`);
    
    // 如果有环境ID，尝试在环境中执行代码
    if (envId && environments[envId] && environments[envId].controller) {
      // 解析响应中的代码部分
      const codeMatch = result.match(/```(?:javascript|js)?\s*([\s\S]*?)```/);
      const code = codeMatch ? codeMatch[1].trim() : null;
      
      if (code) {
        try {
          console.log(`尝试在环境 ${envId} 中执行生成的代码`);
          
          // 获取环境的controller和page
          const controller = environments[envId].controller;
          
          // 预处理代码，使其适合在浏览器中执行
          let browserCode = code;
          
          // 检查是否包含Node.js特有的语法，如require或window.puppeteer
          if (browserCode.includes('require(') || 
              browserCode.includes('puppeteer') || 
              browserCode.includes('browser.newPage') ||
              browserCode.includes('page.goto')) {
            
            console.log('检测到Puppeteer相关代码，正在转换为浏览器兼容代码...');
            
            // 尝试提取URL模式
            const urlPatterns = [
              /goto\s*\(\s*['"]([^'"]+)['"]\s*\)/,             // 标准goto模式
              /page\.goto\s*\(\s*['"]([^'"]+)['"]\s*\)/,       // page.goto模式
              /navigate\s*\(\s*['"]([^'"]+)['"]\s*\)/,         // navigate模式
              /url\s*:\s*['"]([^'"]+)['"]/,                    // url:模式
              /location\.href\s*=\s*['"]([^'"]+)['"]/,         // location.href模式
              /window\.location\.href\s*=\s*['"]([^'"]+)['"]/  // window.location.href模式
            ];
            
            // 检查所有URL模式
            let targetUrl = null;
            for (const pattern of urlPatterns) {
              const match = browserCode.match(pattern);
              if (match && match[1]) {
                targetUrl = match[1];
                console.log(`检测到URL: ${targetUrl} (使用模式: ${pattern})`);
                break;
              }
            }
            
            if (targetUrl) {
              console.log(`检测到导航命令，目标URL: ${targetUrl}`);
              
              // 替换为简单的浏览器导航代码，增加反馈
              browserCode = `
                (async () => {
                  try {
                    console.log('✅ 正在导航到 ${targetUrl}...');
                    
                    // 添加导航前的反馈
                    const feedbackDiv = document.createElement('div');
                    feedbackDiv.style.position = 'fixed';
                    feedbackDiv.style.top = '10px';
                    feedbackDiv.style.left = '10px';
                    feedbackDiv.style.padding = '10px';
                    feedbackDiv.style.background = 'rgba(46, 204, 113, 0.8)';
                    feedbackDiv.style.borderRadius = '5px';
                    feedbackDiv.style.color = 'white';
                    feedbackDiv.style.zIndex = '10000';
                    feedbackDiv.textContent = '正在导航到: ${targetUrl}';
                    document.body.appendChild(feedbackDiv);
                    
                    // 等待一秒，让用户看到反馈
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // 执行导航
                    window.location.href = '${targetUrl}';
                    
                    // 返回成功
                    return { success: true, message: '已导航到 ${targetUrl}' };
                  } catch (error) {
                    console.error('导航出错:', error);
                    return { success: false, error: error.toString() };
                  }
                })();
              `;
            } else {
              // 尝试查找更多puppeteer操作模式
              const hasScreenshot = browserCode.includes('screenshot') || browserCode.includes('截图');
              const hasClick = browserCode.includes('.click') || browserCode.includes('点击');
              const hasType = browserCode.includes('.type') || browserCode.includes('输入');
              
              if (hasClick) {
                // 尝试提取点击选择器
                const clickPattern = /click\s*\(\s*['"]([^'"]+)['"]\s*\)/;
                const clickMatch = browserCode.match(clickPattern);
                const selector = clickMatch ? clickMatch[1] : '.btn, button, a, input[type="button"], input[type="submit"]';
                
                browserCode = `
                  (async () => {
                    try {
                      console.log('✅ 尝试点击元素:', '${selector}');
                      
                      // 添加点击反馈
                      const elements = document.querySelectorAll('${selector}');
                      if (elements.length === 0) {
                        throw new Error('未找到匹配的元素: ${selector}');
                      }
                      
                      // 找到的第一个元素
                      const element = elements[0];
                      
                      // 高亮元素
                      const originalStyle = element.style.cssText;
                      element.style.outline = '2px solid red';
                      element.style.boxShadow = '0 0 10px rgba(255,0,0,0.5)';
                      
                      // 添加反馈消息
                      const feedbackDiv = document.createElement('div');
                      feedbackDiv.style.position = 'fixed';
                      feedbackDiv.style.top = '10px';
                      feedbackDiv.style.left = '10px';
                      feedbackDiv.style.padding = '10px';
                      feedbackDiv.style.background = 'rgba(46, 204, 113, 0.8)';
                      feedbackDiv.style.borderRadius = '5px';
                      feedbackDiv.style.color = 'white';
                      feedbackDiv.style.zIndex = '10000';
                      feedbackDiv.textContent = '点击元素: ' + element.tagName + (element.id ? '#'+element.id : '');
                      document.body.appendChild(feedbackDiv);
                      
                      // 等待一秒
                      await new Promise(resolve => setTimeout(resolve, 1000));
                      
                      // 执行点击
                      element.click();
                      
                      // 恢复样式
                      setTimeout(() => {
                        element.style.cssText = originalStyle;
                        feedbackDiv.remove();
                      }, 2000);
                      
                      return { 
                        success: true, 
                        message: '已点击元素: ' + element.tagName + (element.id ? '#'+element.id : '') 
                      };
                    } catch (error) {
                      console.error('点击元素出错:', error);
                      return { success: false, error: error.toString() };
                    }
                  })();
                `;
              } else if (hasType) {
                // 尝试提取输入选择器和文本
                const typePattern = /type\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/;
                const typeMatch = browserCode.match(typePattern);
                const selector = typeMatch ? typeMatch[1] : 'input[type="text"]';
                const text = typeMatch ? typeMatch[2] : '测试文本';
                
                browserCode = `
                  (async () => {
                    try {
                      console.log('✅ 尝试在元素中输入文本:', '${selector}', '${text}');
                      
                      // 查找元素
                      const elements = document.querySelectorAll('${selector}');
                      if (elements.length === 0) {
                        throw new Error('未找到匹配的输入元素: ${selector}');
                      }
                      
                      // 找到的第一个元素
                      const element = elements[0];
                      
                      // 高亮元素
                      const originalStyle = element.style.cssText;
                      element.style.outline = '2px solid blue';
                      element.style.boxShadow = '0 0 10px rgba(0,0,255,0.5)';
                      
                      // 添加反馈消息
                      const feedbackDiv = document.createElement('div');
                      feedbackDiv.style.position = 'fixed';
                      feedbackDiv.style.top = '10px';
                      feedbackDiv.style.left = '10px';
                      feedbackDiv.style.padding = '10px';
                      feedbackDiv.style.background = 'rgba(46, 204, 113, 0.8)';
                      feedbackDiv.style.borderRadius = '5px';
                      feedbackDiv.style.color = 'white';
                      feedbackDiv.style.zIndex = '10000';
                      feedbackDiv.textContent = '输入文本: ${text}';
                      document.body.appendChild(feedbackDiv);
                      
                      // 聚焦元素
                      element.focus();
                      
                      // 清除现有内容
                      element.value = '';
                      
                      // 执行输入
                      element.value = '${text}';
                      
                      // 触发输入事件
                      const event = new Event('input', { bubbles: true });
                      element.dispatchEvent(event);
                      
                      // 等待一秒
                      await new Promise(resolve => setTimeout(resolve, 1000));
                      
                      // 恢复样式
                      setTimeout(() => {
                        element.style.cssText = originalStyle;
                        feedbackDiv.remove();
                      }, 2000);
                      
                      return { 
                        success: true, 
                        message: '已在元素中输入文本: ' + element.tagName + (element.id ? '#'+element.id : '') 
                      };
                    } catch (error) {
                      console.error('输入文本出错:', error);
                      return { success: false, error: error.toString() };
                    }
                  })();
                `;
              } else if (hasScreenshot) {
                browserCode = `
                  (async () => {
                    try {
                      console.log('✅ 浏览器环境不支持截图功能，但可以模拟反馈');
                      
                      // 添加反馈消息
                      const feedbackDiv = document.createElement('div');
                      feedbackDiv.style.position = 'fixed';
                      feedbackDiv.style.top = '10px';
                      feedbackDiv.style.left = '10px';
                      feedbackDiv.style.padding = '10px';
                      feedbackDiv.style.background = 'rgba(46, 204, 113, 0.8)';
                      feedbackDiv.style.borderRadius = '5px';
                      feedbackDiv.style.color = 'white';
                      feedbackDiv.style.zIndex = '10000';
                      feedbackDiv.textContent = '截图功能在浏览器环境中不可用';
                      document.body.appendChild(feedbackDiv);
                      
                      // 等待2秒
                      await new Promise(resolve => setTimeout(resolve, 2000));
                      
                      // 移除反馈
                      feedbackDiv.remove();
                      
                      return { 
                        success: true, 
                        message: '浏览器环境不支持截图功能，请使用其他方式截图' 
                      };
                    } catch (error) {
                      console.error('截图操作出错:', error);
                      return { success: false, error: error.toString() };
                    }
                  })();
                `;
              } else {
                // 通用浏览器行为模拟
                browserCode = `
                  (async () => {
                    try {
                      console.log('✅ 执行浏览器兼容操作');
                      
                      // 添加反馈消息
                      const feedbackDiv = document.createElement('div');
                      feedbackDiv.style.position = 'fixed';
                      feedbackDiv.style.top = '10px';
                      feedbackDiv.style.left = '10px';
                      feedbackDiv.style.padding = '10px';
                      feedbackDiv.style.background = 'rgba(46, 204, 113, 0.8)';
                      feedbackDiv.style.borderRadius = '5px';
                      feedbackDiv.style.color = 'white';
                      feedbackDiv.style.zIndex = '10000';
                      feedbackDiv.textContent = '执行浏览器操作';
                      document.body.appendChild(feedbackDiv);
                      
                      // 显示当前页面信息
                      console.log('当前页面标题:', document.title);
                      console.log('当前页面URL:', window.location.href);
                      
                      // 等待1秒
                      await new Promise(resolve => setTimeout(resolve, 1000));
                      
                      // 移除反馈
                      feedbackDiv.remove();
                      
                      return { 
                        success: true, 
                        message: '已在浏览器中执行基本操作',
                        info: {
                          title: document.title,
                          url: window.location.href,
                          time: new Date().toISOString()
                        }
                      };
                    } catch (error) {
                      console.error('浏览器操作出错:', error);
                      return { success: false, error: error.toString() };
                    }
                  })();
                `;
              }
            }
          } else {
            // 非Puppeteer代码，可能是普通浏览器代码
            // 添加一些安全防护
            const hasDangerousCode = 
              browserCode.includes('eval(') || 
              browserCode.includes('Function(') ||
              browserCode.includes('document.write') ||
              browserCode.includes('innerHTML') ||
              browserCode.includes('localStorage.setItem');
              
            if (hasDangerousCode) {
              console.warn('检测到可能不安全的代码模式，添加安全警告');
              
              // 在代码执行前添加安全警告
              browserCode = `
                (async () => {
                  console.warn('⚠️ 正在执行包含可能不安全操作的代码，请小心');
                  
                  try {
                    ${browserCode}
                    return { success: true, message: '代码执行完成' };
                  } catch (error) {
                    console.error('代码执行错误:', error);
                    return { success: false, error: error.toString() };
                  }
                })();
              `;
            } else {
              // 包装普通代码以确保正确返回结果
              browserCode = `
                (async () => {
                  try {
                    console.log('✅ 正在执行浏览器代码');
                    
                    ${browserCode}
                    
                    return { success: true, message: '代码执行成功' };
                  } catch (error) {
                    console.error('代码执行错误:', error);
                    return { success: false, error: error.toString() };
                  }
                })();
              `;
            }
          }
          
          // 在浏览器环境中执行代码
          const executionResult = await controller.page.evaluate((codeToExecute) => {
            // 在浏览器环境中安全执行代码
            try {
              // 创建一个异步函数来包装可能的异步代码
              return new Promise(async (resolve, reject) => {
                try {
                  // 添加超时机制
                  const timeoutId = setTimeout(() => {
                    reject(new Error('代码执行超时(30秒)'));
                  }, 30000);
                  
                  // 使用eval执行代码
                  const result = eval(`(async () => { ${codeToExecute} })()`);
                  
                  // 等待结果
                  await result;
                  
                  // 清除超时
                  clearTimeout(timeoutId);
                  
                  resolve({ success: true, message: '代码执行成功' });
                } catch (error) {
                  reject(error);
                }
              });
            } catch (error) {
              return { success: false, error: error.toString() };
            }
          }, browserCode);
          
          console.log('代码执行结果:', executionResult);
          
          // 将执行结果添加到响应中
          return res.json({ 
            success: true, 
            result,
            execution_result: executionResult,
            executionSuccess: executionResult.success,
            executionMessage: executionResult.message || executionResult.error,
            message: `命令已执行${executionResult.success ? '成功' : '但有错误'}`
          });
        } catch (execError) {
          console.error(`代码执行失败:`, execError);
          return res.json({ 
            success: true, 
            result,
            execution_result: {
              success: false,
              error: execError.message
            },
            executionSuccess: false,
            executionMessage: execError.message,
            message: `命令已执行但代码执行失败: ${execError.message}`
          });
        }
      }
    }
    
    // 如果没有环境ID或没有代码可执行，直接返回生成结果
    return res.json({ success: true, result, message: '命令已执行' });
  } catch (error) {
    console.error('AI命令执行失败:', error);
    return res.status(500).json({ success: false, message: `执行失败: ${error.message}` });
  }
});

// AI服务状态API端点
app.get('/api/ai/status', (req, res) => {
  try {
    const openaiConfigured = !!OPENAI_API_KEY;
    const deepseekConfigured = !!DEEPSEEK_API_KEY;
    
    // 检查是否至少有一个API被配置
    const aiAvailable = openaiConfigured || deepseekConfigured;
    
    // 返回状态信息
    res.json({
      success: true,
      available: aiAvailable,
      providers: {
        openai: {
          configured: openaiConfigured,
          url: OPENAI_API_URL
        },
        deepseek: {
          configured: deepseekConfigured
        }
      },
      defaultProvider: openaiConfigured ? 'openai' : (deepseekConfigured ? 'deepseek' : null)
    });
  } catch (error) {
    console.error('获取AI状态失败:', error);
    res.status(500).json({
      success: false,
      available: false,
      error: error.message
    });
  }
});

// 获取单个环境详情
app.get('/api/environments/:envId', async (req, res) => {
  const envId = req.params.envId;
  
  console.log(`接收到获取环境详情请求，环境ID: ${envId}`);
  
  try {
    // 从AdsPower API获取环境详情
    const environmentDetails = await adspowerApi.getEnvironmentDetails(envId);
    
    // 检查环境是否存在
    if (!environmentDetails || (environmentDetails.code !== 0 && environmentDetails.code !== undefined)) {
      console.error(`获取环境 ${envId} 详情失败:`, environmentDetails);
      return res.status(404).json({
        success: false,
        message: `未找到环境 ${envId} 或获取详情失败`,
        error: environmentDetails?.msg || '未知错误'
      });
    }
    
    // 获取环境备注
    const notes = getEnvironmentNotes(envId);
    
    // 检查环境是否在运行中
    const isRunning = environments[envId] && environments[envId].controller;
    
    // 构造响应
    const response = {
      success: true,
      environment: {
        ...environmentDetails.data,
        id: envId,
        user_id: envId,
        is_running: isRunning,
        notes: notes
      }
    };
    
    if (isRunning) {
      response.environment.startTime = environments[envId].startTime;
      response.environment.lastActivity = environments[envId].lastActivity;
    }
    
    res.json(response);
  } catch (error) {
    console.error(`获取环境 ${envId} 详情失败:`, error);
    res.status(500).json({
      success: false,
      message: `获取环境详情失败: ${error.message}`
    });
  }
});

// 获取标签页列表
app.get('/api/element-explorer/:envId/tabs', async (req, res) => {
  try {
    const envId = req.params.envId;
    
    // 检查环境是否存在
    if (!environments[envId]) {
      return res.json({ 
        success: false, 
        message: '找不到指定的环境' 
      });
    }
    
    // 检查环境是否有controller
    if (!environments[envId].controller) {
      return res.json({ 
        success: false, 
        message: '环境未启动或未正确连接' 
      });
    }
    
    console.log(`获取环境 ${envId} 的标签页列表`);
    
    const controller = environments[envId].controller;
    
    // 获取所有标签页
    const tabs = await controller.getPages();
    
    // 获取当前活跃标签页
    let activeTab = null;
    try {
      activeTab = await controller.getActiveTab();
    } catch (error) {
      console.warn(`获取活跃标签页失败: ${error.message}`);
    }
    
    return res.json({
      success: true,
      tabs: tabs,
      activeTab: activeTab,
      message: `成功获取 ${tabs.length} 个标签页`
    });
  } catch (error) {
    console.error('获取标签页列表失败:', error);
    return res.json({
      success: false,
      message: '获取标签页列表失败: ' + error.message
    });
  }
});

// 切换标签页
app.post('/api/element-explorer/:envId/switch-tab', async (req, res) => {
  try {
    const envId = req.params.envId;
    const { tabId } = req.body;
    
    // 检查环境是否存在
    if (!environments[envId]) {
      return res.json({ 
        success: false, 
        message: '找不到指定的环境' 
      });
    }
    
    // 检查环境是否有controller
    if (!environments[envId].controller) {
      return res.json({ 
        success: false, 
        message: '环境未启动或未正确连接' 
      });
    }
    
    if (tabId === undefined) {
      return res.json({
        success: false,
        message: '未提供标签页ID'
      });
    }
    
    console.log(`切换环境 ${envId} 到标签页 ${tabId}`);
    
    const controller = environments[envId].controller;
    
    // 切换到指定标签页
    await controller.switchToPage(tabId);
    
    return res.json({
      success: true,
      message: '成功切换标签页'
    });
  } catch (error) {
    console.error('切换标签页失败:', error);
    return res.json({
      success: false,
      message: '切换标签页失败: ' + error.message
    });
  }
});

// 设置页面路由
app.get('/settings', async (req, res) => {
  try {
    // 检查API连接状态
    const isConnected = await checkAdsPowerConnection();
    
    // 获取当前配置
    const currentSettings = {
      adsPowerPort: config.adsPowerPort || 50325,
      openaiApiKey: config.openaiApiKey || '',
      openaiApiUrl: config.openaiApiUrl || '',
      deepseekApiKey: config.deepseekApiKey || ''
    };
    
    // 检查各API配置状态
    const openaiConfigured = !!OPENAI_API_KEY;
    const deepseekConfigured = !!DEEPSEEK_API_KEY;
    
    res.render('settings', {
      title: 'API 设置 - AdsPower管理器',
      settings: currentSettings,
      configPath: path.join(__dirname, 'config', 'config.json'),
      adspower: { connected: isConnected },
      openai: { configured: openaiConfigured },
      deepseek: { configured: deepseekConfigured },
      message: req.query.message,
      messageType: req.query.type
    });
  } catch (error) {
    console.error('加载设置页面时出错:', error);
    res.render('settings', {
      title: 'API 设置 - AdsPower管理器',
      settings: {},
      configPath: path.join(__dirname, 'config', 'config.json'),
      message: '加载设置时出错: ' + error.message,
      messageType: 'danger'
    });
  }
});

// API设置更新路由
app.post('/api/settings/update', async (req, res) => {
  try {
    console.log('接收到设置更新请求');
    
    // 获取表单提交的数据
    const { adsPowerPort, openaiApiKey, openaiApiUrl, deepseekApiKey } = req.body;
    
    // 验证端口号
    const port = parseInt(adsPowerPort);
    if (isNaN(port) || port <= 0 || port > 65535) {
      return res.redirect('/settings?message=无效的端口号&type=danger');
    }
    
    // 准备新的配置
    const newConfig = {
      ...config,
      adsPowerPort: port,
      openaiApiUrl: openaiApiUrl || ''
    };
    
    // 只有当用户输入了密钥时才更新密钥（避免清空已有密钥）
    if (openaiApiKey && openaiApiKey.trim()) {
      // 验证OpenAI密钥格式
      if (openaiApiKey.trim().startsWith('sk-')) {
        newConfig.openaiApiKey = openaiApiKey.trim();
      } else {
        return res.redirect('/settings?message=OpenAI API密钥格式无效，应以sk-开头&type=danger');
      }
    }
    
    if (deepseekApiKey && deepseekApiKey.trim()) {
      // 验证DeepSeek密钥格式
      if (deepseekApiKey.trim().startsWith('sk-')) {
        newConfig.deepseekApiKey = deepseekApiKey.trim();
      } else {
        return res.redirect('/settings?message=DeepSeek API密钥格式无效，应以sk-开头&type=danger');
      }
    }
    
    // 确保config目录存在
    const configDir = path.join(__dirname, 'config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // 保存新配置到文件
    const configPath = path.join(configDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
    
    console.log('配置已保存到:', configPath);
    console.log('API密钥配置状态:');
    console.log('- OpenAI:', newConfig.openaiApiKey ? '已设置' : '未设置');
    console.log('- DeepSeek:', newConfig.deepseekApiKey ? '已设置' : '未设置');
    
    // 更新全局变量
    config = newConfig;
    
    // 更新API密钥
    if (newConfig.openaiApiKey) {
      OPENAI_API_KEY = newConfig.openaiApiKey;
      // 重新初始化OpenAI客户端
      openaiClient.setApiKey(OPENAI_API_KEY);
      openaiClient.setBaseUrl(newConfig.openaiApiUrl || 'https://api.openai.com');
    }
    
    if (newConfig.deepseekApiKey) {
      DEEPSEEK_API_KEY = newConfig.deepseekApiKey;
      // 重新初始化DeepSeek客户端
      deepseekClient.setApiKey(DEEPSEEK_API_KEY);
    }
    
    // 如果端口更改，尝试重新连接AdsPower API
    if (newConfig.adsPowerPort !== config.adsPowerPort) {
      adspowerApi.updateBaseUrl(`http://localhost:${newConfig.adsPowerPort}/api/v1`);
      await adspowerApi.findWorkingApiUrl();
    }
    
    res.redirect('/settings?message=设置已成功保存&type=success');
  } catch (error) {
    console.error('保存设置时出错:', error);
    res.redirect(`/settings?message=保存设置失败: ${error.message}&type=danger`);
  }
});

// AI聊天API
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, model = 'openai' } = req.body;
    
    if (!message) {
      return res.status(400).json({ success: false, error: '消息不能为空' });
    }
    
    // 检查API密钥配置
    if (model === 'openai' && !OPENAI_API_KEY) {
      return res.status(400).json({ 
        success: false, 
        error: 'OpenAI API密钥未配置', 
        needsConfiguration: true,
        configUrl: '/settings'
      });
    }
    
    if (model === 'deepseek' && !DEEPSEEK_API_KEY) {
      return res.status(400).json({ 
        success: false, 
        error: 'DeepSeek API密钥未配置', 
        needsConfiguration: true,
        configUrl: '/settings'
      });
    }
    
    // 根据选择的模型调用不同的AI客户端
    let response;
    if (model === 'deepseek' && DEEPSEEK_API_KEY) {
      response = await deepseekClient.generateText(message);
    } else {
      response = await openaiClient.generateCompletion(message);
    }
    
    res.json({ success: true, response });
  } catch (error) {
    console.error('AI聊天请求失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// AI状态API
app.get('/api/ai/status', (req, res) => {
  const aiStatus = {
    openai: {
      configured: !!OPENAI_API_KEY,
      status: OPENAI_API_KEY ? 'enabled' : 'disabled'
    },
    deepseek: {
      configured: !!DEEPSEEK_API_KEY,
      status: DEEPSEEK_API_KEY ? 'enabled' : 'disabled'
    },
    defaultModel: (!OPENAI_API_KEY && DEEPSEEK_API_KEY) ? 'deepseek' : 'openai'
  };
  
  res.json(aiStatus);
});

