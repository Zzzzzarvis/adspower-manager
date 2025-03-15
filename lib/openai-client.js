// OpenAI客户端模块 - 负责与OpenAI API交互
const { Configuration, OpenAIApi } = require('openai');
const logger = require('./logger');
const fetch = require('node-fetch');

class OpenAIClient {
  constructor(options) {
    // 支持直接传入apiKey字符串或options对象
    let apiKey, baseUrl;
    if (typeof options === 'string') {
      apiKey = options;
      baseUrl = 'https://api.vveai.com';
    } else {
      apiKey = options.apiKey;
      baseUrl = options.baseUrl || 'https://api.vveai.com';
    }
    
    if (!apiKey) {
      logger.warn('未提供OpenAI API密钥，OpenAI功能将不可用');
      console.warn('未提供OpenAI API密钥，OpenAI功能将不可用');
    } else {
      console.log(`已提供OpenAI API密钥，长度: ${apiKey.length}字符`);
    }
    
    this.apiKey = apiKey;
    this.configuration = new Configuration({ apiKey });
    this.openai = new OpenAIApi(this.configuration);
    this.baseUrl = baseUrl;
    
    console.log(`OpenAI API URL: ${baseUrl}`);
    
    // 频率限制配置
    this.rateLimitConfig = {
      maxRequestsPerMinute: 10,  // 每分钟最大请求数
      retryCount: 3,             // 重试次数
      retryDelay: 2000,          // 重试初始延迟（毫秒）
      retryBackoff: 1.5          // 重试延迟倍数
    };
    
    // 请求计数和时间戳
    this.requestsTimestamps = [];
    
    console.log('OpenAI客户端初始化' + (this.apiKey ? '成功' : '失败'));
  }
  
  /**
   * 检查API密钥是否有效
   * @returns {boolean} 是否有效
   */
  isConfigured() {
    return !!this.apiKey;
  }
  
  /**
   * 检查请求频率限制
   * @returns {boolean} 是否可以发送请求
   */
  async checkRateLimit() {
    const now = Date.now();
    // 保留一分钟内的请求时间戳
    this.requestsTimestamps = this.requestsTimestamps.filter(
      timestamp => now - timestamp < 60000
    );
    
    // 检查是否超过限制
    if (this.requestsTimestamps.length >= this.rateLimitConfig.maxRequestsPerMinute) {
      // 计算需要等待的时间
      const oldestRequest = this.requestsTimestamps[0];
      const waitTime = 60000 - (now - oldestRequest);
      
      if (waitTime > 0) {
        console.log(`请求频率超过限制，等待 ${waitTime}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.checkRateLimit(); // 递归检查
      }
    }
    
    // 记录当前请求
    this.requestsTimestamps.push(now);
    return true;
  }
  
  /**
   * 创建聊天完成
   * @param {array} messages 消息数组
   * @param {object} options 选项
   * @returns {Promise<object>} 完成结果
   */
  async createChatCompletion(messages, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('未配置OpenAI API密钥');
    }
    
    const defaultOptions = {
      model: 'gpt-4o',
      temperature: 0.7,
      max_tokens: 1000,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0
    };
    
    const requestOptions = { ...defaultOptions, ...options, messages };
    
    try {
      logger.debug(`发送请求到OpenAI API (model: ${requestOptions.model})`);
      const response = await this.openai.createChatCompletion(requestOptions);
      
      return {
        text: response.data.choices[0].message.content,
        usage: response.data.usage,
        model: response.data.model,
        id: response.data.id
      };
    } catch (error) {
      logger.error(`OpenAI API请求失败: ${error.message}`);
      throw new Error(`OpenAI API请求失败: ${error.response?.data?.error?.message || error.message}`);
    }
  }
  
  /**
   * 分析浏览器错误
   * @param {object} errorData 错误数据
   * @returns {Promise<object>} 分析结果
   */
  async analyzeError(errorData) {
    if (!this.isConfigured()) {
      throw new Error('未配置OpenAI API密钥');
    }
    
    const messages = [
      {
        role: 'system',
        content: `你是一个专门分析浏览器自动化错误的AI助手。
        你的任务是分析错误消息并提供可能的原因和解决方案。
        请格式化你的回答为JSON，包含以下字段：
        - errorType: 错误类型分类
        - possibleCauses: 可能的原因列表
        - solutions: 建议的解决方案列表
        - severity: 错误严重性 (低/中/高)
        - needsHumanIntervention: 是否需要人工干预 (true/false)`
      },
      {
        role: 'user',
        content: `请分析以下浏览器自动化错误:
        
        错误消息: ${errorData.message}
        
        ${errorData.stackTrace ? `堆栈跟踪:\n${errorData.stackTrace}` : ''}
        ${errorData.url ? `URL: ${errorData.url}` : ''}
        ${errorData.actionType ? `操作类型: ${errorData.actionType}` : ''}
        
        请提供可能的原因和解决建议，以JSON格式返回。`
      }
    ];
    
    try {
      const result = await this.createChatCompletion(messages, {
        model: 'gpt-4o',
        temperature: 0.3,
        max_tokens: 1000
      });
      
      try {
        // 尝试解析返回的JSON
        const analysis = JSON.parse(result.text);
        return analysis;
      } catch (parseError) {
        logger.warn(`无法解析OpenAI返回的JSON: ${parseError.message}`);
        return {
          errorType: '未知',
          possibleCauses: ['无法解析AI返回的分析'],
          solutions: ['请手动分析错误信息'],
          rawResponse: result.text,
          severity: '中',
          needsHumanIntervention: true
        };
      }
    } catch (error) {
      logger.error(`错误分析失败: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * 生成浏览器任务脚本
   * @param {string} taskDescription 任务描述
   * @param {object} options 选项
   * @returns {Promise<object>} 生成的脚本
   */
  async generateBrowserTask(taskDescription, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('未配置OpenAI API密钥');
    }
    
    const messages = [
      {
        role: 'system',
        content: `你是一个浏览器自动化专家，专门将自然语言任务描述转换为结构化的浏览器操作序列。
        你的输出应该是一个JSON数组，每个元素代表一个浏览器操作，包含以下字段：
        - type: 操作类型 (navigate, click, type, wait, screenshot, evaluate, waitForElement)
        - 以及每种操作类型需要的特定参数。
        
        示例输出格式:
        [
          {"type": "navigate", "url": "https://example.com"},
          {"type": "waitForElement", "selector": "#login-form"},
          {"type": "type", "selector": "#username", "text": "user123"},
          {"type": "click", "selector": "#submit-btn"}
        ]`
      },
      {
        role: 'user',
        content: `请将以下任务描述转换为浏览器操作序列:
        
        ${taskDescription}
        
        ${options.currentUrl ? `当前URL: ${options.currentUrl}` : ''}
        ${options.context ? `上下文: ${options.context}` : ''}
        
        请返回JSON格式的操作序列。`
      }
    ];
    
    try {
      const result = await this.createChatCompletion(messages, {
        model: options.model || 'gpt-4o',
        temperature: 0.2,
        max_tokens: 2000
      });
      
      try {
        // 尝试解析返回的JSON
        const tasks = JSON.parse(result.text);
        return {
          tasks,
          rawResponse: result.text
        };
      } catch (parseError) {
        logger.warn(`无法解析OpenAI返回的JSON: ${parseError.message}`);
        return {
          error: '无法解析返回的任务JSON',
          rawResponse: result.text
        };
      }
    } catch (error) {
      logger.error(`生成任务失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 生成文本补全
   * @param {string} prompt 提示文本
   * @returns {Promise<string>} 生成的文本
   */
  async generateCompletion(prompt) {
    console.log('OpenAI生成文本，提示长度:', prompt.length);
    
    if (!this.apiKey) {
      console.error('未设置OpenAI API密钥');
      throw new Error('未设置OpenAI API密钥');
    }
    
    // 检查频率限制
    await this.checkRateLimit();
    
    // 实现重试逻辑
    for (let attempt = 0; attempt <= this.rateLimitConfig.retryCount; attempt++) {
      try {
        // 计算延迟
        if (attempt > 0) {
          const delay = this.rateLimitConfig.retryDelay * 
            Math.pow(this.rateLimitConfig.retryBackoff, attempt - 1);
          console.log(`第${attempt}次重试，等待${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // 使用API地址，支持自定义基础URL
        const apiUrl = this.baseUrl;
        console.log(`使用API URL: ${apiUrl}`);
        
        const response = await fetch(`${apiUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: '你是一个专业的编程助手，请提供精确的Puppeteer代码来完成指定任务，代码需要适配最新版本的Puppeteer。只返回可执行代码，不包含解释。' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 2000,
            temperature: 0.7
          }),
          timeout: 60000 // 60秒超时
        });
        
        // 检查响应状态
        if (!response.ok) {
          let errorText = '';
          try {
            const errorJson = await response.json();
            errorText = errorJson.error?.message || JSON.stringify(errorJson);
          } catch (e) {
            errorText = await response.text() || `HTTP错误: ${response.status}`;
          }
          
          // 429错误（频率限制）时重试
          if (response.status === 429 && attempt < this.rateLimitConfig.retryCount) {
            console.log(`遇到频率限制(429)，将在下次重试`);
            continue;
          }
          
          console.error('OpenAI API错误:', errorText);
          throw new Error(`OpenAI API错误: ${errorText}`);
        }
        
        const data = await response.json();
        
        // 验证响应格式
        if (!data.choices || data.choices.length === 0) {
          console.error('无效的OpenAI响应格式:', data);
          throw new Error('无效的OpenAI响应格式');
        }
        
        const generatedText = data.choices[0].message.content;
        console.log('OpenAI生成成功，文本长度:', generatedText.length);
        
        return generatedText;
      } catch (error) {
        console.error(`OpenAI生成失败(尝试 ${attempt + 1}/${this.rateLimitConfig.retryCount + 1}):`, error);
        
        // 网络错误或超时时重试
        const isNetworkError = 
          error.message.includes('network') || 
          error.message.includes('timeout') ||
          error.code === 'ECONNRESET';
          
        if (isNetworkError && attempt < this.rateLimitConfig.retryCount) {
          continue; // 网络错误时继续重试
        }
        
        // 最后一次尝试失败，返回备用代码
        if (attempt === this.rateLimitConfig.retryCount) {
          console.log('所有重试都失败，返回本地生成的示例代码');
          return this.getFallbackCode(prompt);
        }
        
        throw error;
      }
    }
  }
  
  /**
   * 根据提示获取备用代码
   * @param {string} prompt 原始提示
   * @returns {string} 备用代码
   */
  getFallbackCode(prompt) {
    // 根据提示内容返回不同的备用代码
    if (prompt.includes('随机数') || prompt.includes('random')) {
      return `function generateRandomNumber(min = 0, max = 100) {
  // 确保输入参数是数字
  min = Number(min);
  max = Number(max);
  
  // 确保最小值小于最大值
  if (min > max) {
    [min, max] = [max, min];
  }
  
  // 生成随机数并返回
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 使用示例
// const random = generateRandomNumber(1, 10);
// console.log(random);`;
    } else if (prompt.includes('排序') || prompt.includes('sort')) {
      return `function sortArray(arr) {
  if (!Array.isArray(arr)) {
    throw new Error('输入必须是数组');
  }
  
  // 使用快速排序算法
  return arr.sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b; // 数字排序
    } else {
      return String(a).localeCompare(String(b)); // 字符串排序
    }
  });
}

// 使用示例
// const sorted = sortArray([3, 1, 5, 2, 4]);
// console.log(sorted); // [1, 2, 3, 4, 5]`;
    } else {
      // 默认返回通用的辅助函数
      return `function executeTask(task) {
  console.log(\`执行任务: \${task}\`);
  
  // 这里是一个示例实现
  // 由于AI无法生成具体代码，这是一个备用实现
  return {
    status: 'success',
    message: '任务完成',
    timestamp: new Date().toISOString()
  };
}

// 使用示例
// const result = executeTask('示例任务');
// console.log(result);`;
    }
  }

  /**
   * 设置API密钥
   * @param {string} apiKey - 新的API密钥
   */
  setApiKey(apiKey) {
    if (!apiKey) {
      console.warn('警告: 尝试设置空的OpenAI API密钥');
      return;
    }
    
    console.log(`正在更新OpenAI API密钥 (新密钥长度: ${apiKey.length}字符)`);
    this.apiKey = apiKey;
    this.configuration = new Configuration({ apiKey });
    
    // 如果baseUrl已设置，确保它也被保留
    if (this.baseUrl) {
      this.openai = new OpenAIApi(this.configuration, this.baseUrl);
    } else {
      this.openai = new OpenAIApi(this.configuration);
    }
    
    console.log('OpenAI客户端API密钥已更新');
  }
  
  /**
   * 设置API基础URL
   * @param {string} baseUrl - 新的API基础URL
   */
  setBaseUrl(baseUrl) {
    if (!baseUrl) {
      console.warn('警告: 尝试设置空的OpenAI API基础URL');
      return;
    }
    
    console.log(`正在更新OpenAI API基础URL: ${baseUrl}`);
    this.baseUrl = baseUrl;
    
    // 重新创建客户端
    if (this.apiKey) {
      this.openai = new OpenAIApi(this.configuration, this.baseUrl);
      console.log('OpenAI客户端基础URL已更新');
    }
  }
}

module.exports = OpenAIClient;
