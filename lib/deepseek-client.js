const fetch = require('node-fetch');
const logger = require('./logger');

class DeepSeekClient {
  constructor(apiKey, options = {}) {
    if (!apiKey) {
      logger.warn('未提供DeepSeek API密钥，DeepSeek功能将不可用');
    }
    
    this.apiKey = apiKey;
    this.baseURL = options.baseURL || 'https://api.deepseek.com/v1';
    this.timeout = options.timeout || 60000; // 60秒超时
    this.apiUrl = 'https://api.deepseek.com/v1/chat/completions';
    
    console.log('DeepSeek客户端初始化' + (this.apiKey ? '成功' : '失败'));
    
    this.client = fetch.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: this.timeout
    });
  }
  
  /**
   * 检查API密钥是否有效
   * @returns {boolean} 是否有效
   */
  isConfigured() {
    return !!this.apiKey;
  }
  
  /**
   * 创建聊天完成
   * @param {array} messages 消息数组
   * @param {object} options 选项
   * @returns {Promise<object>} 完成结果
   */
  async createChatCompletion(messages, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('未配置DeepSeek API密钥');
    }
    
    const defaultOptions = {
      model: 'deepseek-chat',
      temperature: 0.7,
      max_tokens: 1000,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0
    };
    
    const requestOptions = { ...defaultOptions, ...options, messages };
    
    try {
      logger.debug(`发送请求到DeepSeek API (model: ${requestOptions.model})`);
      const response = await this.client.post('/chat/completions', requestOptions);
      
      return {
        text: response.data.choices[0].message.content,
        usage: response.data.usage,
        model: response.data.model,
        id: response.data.id
      };
    } catch (error) {
      const errorMsg = error.response ? 
        `状态码: ${error.response.status}, 消息: ${error.response.data?.error?.message || error.message}` : 
        error.message;
      
      logger.error(`DeepSeek API请求失败: ${errorMsg}`);
      throw new Error(`DeepSeek API请求失败: ${errorMsg}`);
    }
  }
  
  /**
   * 分析浏览器错误
   * @param {object} errorData 错误数据
   * @returns {Promise<object>} 分析结果
   */
  async analyzeError(errorData) {
    if (!this.isConfigured()) {
      throw new Error('未配置DeepSeek API密钥');
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
        model: 'deepseek-chat',
        temperature: 0.3,
        max_tokens: 1000
      });
      
      try {
        // 尝试解析返回的JSON
        const analysis = JSON.parse(result.text);
        return analysis;
      } catch (parseError) {
        logger.warn(`无法解析DeepSeek返回的JSON: ${parseError.message}`);
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
      throw new Error('未配置DeepSeek API密钥');
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
        model: options.model || 'deepseek-chat',
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
        logger.warn(`无法解析DeepSeek返回的JSON: ${parseError.message}`);
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
   * 生成文本
   * @param {string} prompt 提示文本
   * @returns {Promise<string>} 生成的文本
   */
  async generateText(prompt) {
    console.log('DeepSeek生成文本，提示长度:', prompt.length);
    
    if (!this.apiKey) {
      console.error('未设置DeepSeek API密钥');
      throw new Error('未设置DeepSeek API密钥');
    }
    
    try {
      // 使用自定义API地址或默认地址
      const apiUrl = this.baseURL || 'https://api.deepseek.com/v1';
      const response = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-coder',
          messages: [
            { role: 'system', content: '你是一个专业的编程助手，请提供精确的Puppeteer代码来完成指定任务，代码需要适配最新版本的Puppeteer。只返回可执行代码，不包含解释。' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 2000,
          temperature: 0.2
        }),
        timeout: this.timeout || 30000 // 默认30秒超时
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
        
        console.error('DeepSeek API错误:', errorText);
        throw new Error(`DeepSeek API错误: ${errorText}`);
      }
      
      // 解析响应
      const data = await response.json();
      
      // 验证响应格式
      if (!data || !data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
        console.error('DeepSeek返回了无效的响应格式:', JSON.stringify(data));
        throw new Error('DeepSeek API返回了无效的响应格式');
      }
      
      // 提取生成的文本
      const generatedText = data.choices[0].message.content.trim();
      console.log('DeepSeek生成完成，响应长度:', generatedText.length);
      
      return generatedText;
    } catch (error) {
      console.error('DeepSeek生成文本失败:', error.message);
      // 返回友好的错误信息而不是抛出异常
      return `生成文本时出错: ${error.message}`;
    }
  }

  /**
   * 设置API密钥
   * @param {string} apiKey - 新的API密钥
   */
  setApiKey(apiKey) {
    if (!apiKey) {
      console.warn('警告: 尝试设置空的DeepSeek API密钥');
      return;
    }
    
    console.log(`正在更新DeepSeek API密钥 (新密钥长度: ${apiKey.length}字符)`);
    this.apiKey = apiKey;
    console.log('DeepSeek客户端API密钥已更新');
  }
}

module.exports = DeepSeekClient;
