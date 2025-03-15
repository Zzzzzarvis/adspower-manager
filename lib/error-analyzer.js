// 错误分析器模块 - 负责分析和处理浏览器和任务执行错误
const logger = require('./logger');
const fs = require('fs');
const path = require('path');

class ErrorAnalyzer {
  constructor(options = {}) {
    this.errors = [];
    this.maxErrorSize = options.maxErrorSize || 1000;
    this.errorTypeCounts = {};
    this.errorDateCounts = {};
    this.lastAnalysisTime = null;
    this.errorPatternsConfig = options.errorPatterns || this.getDefaultErrorPatterns();
    this.errorStoragePath = options.errorStoragePath || path.join(__dirname, '..', 'config', 'error-logs.json');
    
    // 加载历史错误记录
    this.loadErrors();
  }
  
  /**
   * 记录一个新错误
   * @param {Object} errorData 错误数据对象
   */
  recordError(errorData) {
    if (!errorData || !errorData.message) {
      return;
    }
    
    // 创建错误记录
    const errorRecord = {
      id: this.errors.length + 1,
      timestamp: new Date(),
      message: errorData.message,
      type: this.categorizeError(errorData.message),
      source: errorData.source || 'unknown',
      environmentId: errorData.environmentId,
      taskId: errorData.taskId,
      actionType: errorData.actionType,
      url: errorData.url,
      stackTrace: errorData.stackTrace,
      metadata: errorData.metadata || {}
    };
    
    // 添加到错误列表
    this.errors.unshift(errorRecord);
    
    // 限制错误列表大小
    if (this.errors.length > this.maxErrorSize) {
      this.errors.pop();
    }
    
    // 更新错误类型统计
    this.errorTypeCounts[errorRecord.type] = (this.errorTypeCounts[errorRecord.type] || 0) + 1;
    
    // 更新按日期的统计
    const dateKey = errorRecord.timestamp.toISOString().split('T')[0];
    this.errorDateCounts[dateKey] = (this.errorDateCounts[dateKey] || 0) + 1;
    
    // 保存错误记录
    this.saveErrors();
    
    // 记录到日志
    logger.error(`错误分析器: ${errorRecord.type} - ${errorRecord.message}`);
    
    return errorRecord;
  }
  
  /**
   * 根据错误消息对错误进行分类
   * @param {string} message 错误消息
   * @returns {string} 错误类型
   */
  categorizeError(message) {
    if (!message) return 'unknown';
    
    for (const [type, patterns] of Object.entries(this.errorPatternsConfig)) {
      for (const pattern of patterns) {
        if (message.includes(pattern) || (pattern instanceof RegExp && pattern.test(message))) {
          return type;
        }
      }
    }
    
    return 'other';
  }
  
  /**
   * 默认错误模式配置
   * @returns {Object} 错误模式对象
   */
  getDefaultErrorPatterns() {
    return {
      'network': [
        'net::ERR_', 
        'Failed to fetch', 
        'Network error', 
        'timeout', 
        'ECONNREFUSED',
        'ETIMEDOUT'
      ],
      'auth': [
        'Authentication failed', 
        'Authorization required', 
        'Invalid credentials',
        '401',
        '403'
      ],
      'selector': [
        'Waiting for selector', 
        'Target closed', 
        'Element not found',
        'selector timed out'
      ],
      'script': [
        'Evaluation failed', 
        'Script error', 
        'ReferenceError',
        'TypeError',
        'SyntaxError'
      ],
      'browser': [
        'Browser disconnected', 
        'Target crashed', 
        'Browser context',
        'Page crashed',
        'Navigation timeout'
      ],
      'api': [
        'API error', 
        'API request failed', 
        'Request failed',
        'Invalid response'
      ]
    };
  }
  
  /**
   * 分析错误并生成报告
   * @returns {Object} 错误分析报告
   */
  analyzeErrors() {
    this.lastAnalysisTime = new Date();
    
    // 总错误数
    const totalErrors = this.errors.length;
    if (totalErrors === 0) {
      return {
        totalErrors: 0,
        typeSummary: {},
        dateDistribution: {},
        topErrors: [],
        recommendations: ['没有记录的错误。']
      };
    }
    
    // 错误类型统计
    const typeSummary = { ...this.errorTypeCounts };
    
    // 最近7天的错误统计
    const dateDistribution = {};
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      dateDistribution[dateKey] = this.errorDateCounts[dateKey] || 0;
    }
    
    // 最常见错误消息
    const errorMessageCounts = {};
    this.errors.forEach(error => {
      const message = error.message.substring(0, 100); // 截断长消息
      errorMessageCounts[message] = (errorMessageCounts[message] || 0) + 1;
    });
    
    const topErrors = Object.entries(errorMessageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([message, count]) => ({ message, count }));
    
    // 生成建议
    const recommendations = this.generateRecommendations();
    
    return {
      totalErrors,
      typeSummary,
      dateDistribution,
      topErrors,
      recommendations
    };
  }
  
  /**
   * 根据错误模式生成建议
   * @returns {Array} 建议列表
   */
  generateRecommendations() {
    const recommendations = [];
    const errorTypes = Object.keys(this.errorTypeCounts);
    
    // 根据错误类型提供建议
    if (this.errorTypeCounts['network'] > 0) {
      recommendations.push('检查网络连接和代理设置，可能存在网络问题。');
    }
    
    if (this.errorTypeCounts['auth'] > 0) {
      recommendations.push('验证账号凭据是否有效，检查登录逻辑。');
    }
    
    if (this.errorTypeCounts['selector'] > 0) {
      recommendations.push('检查元素选择器，页面结构可能已更改。');
    }
    
    if (this.errorTypeCounts['script'] > 0) {
      recommendations.push('检查执行脚本语法和逻辑，可能存在JavaScript错误。');
    }
    
    if (this.errorTypeCounts['browser'] > 0) {
      recommendations.push('浏览器可能不稳定，尝试重启浏览器或增加超时时间。');
    }
    
    if (this.errorTypeCounts['api'] > 0) {
      recommendations.push('API请求失败，检查API端点和参数是否正确。');
    }
    
    // 如果没有特定建议，提供一般建议
    if (recommendations.length === 0) {
      recommendations.push('定期检查错误日志，优化自动化流程。');
    }
    
    return recommendations;
  }
  
  /**
   * 获取特定类型的错误
   * @param {string} type 错误类型
   * @param {number} limit 限制数量
   * @returns {Array} 错误列表
   */
  getErrorsByType(type, limit = 50) {
    return this.errors
      .filter(error => error.type === type)
      .slice(0, limit);
  }
  
  /**
   * 获取特定环境的错误
   * @param {string} envId 环境ID
   * @param {number} limit 限制数量
   * @returns {Array} 错误列表
   */
  getErrorsByEnvironment(envId, limit = 50) {
    return this.errors
      .filter(error => error.environmentId === envId)
      .slice(0, limit);
  }
  
  /**
   * 获取最近的错误
   * @param {number} limit 限制数量
   * @returns {Array} 错误列表
   */
  getRecentErrors(limit = 50) {
    return this.errors.slice(0, limit);
  }
  
  /**
   * 清空错误记录
   */
  clearErrors() {
    this.errors = [];
    this.errorTypeCounts = {};
    this.errorDateCounts = {};
    this.saveErrors();
    logger.info('错误分析器: 已清空所有错误记录');
  }
  
  /**
   * 保存错误记录到文件
   */
  saveErrors() {
    try {
      const configDir = path.dirname(this.errorStoragePath);
      
      // 确保配置目录存在
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      const errorData = {
        errors: this.errors,
        errorTypeCounts: this.errorTypeCounts,
        errorDateCounts: this.errorDateCounts,
        lastUpdate: new Date()
      };
      
      fs.writeFileSync(this.errorStoragePath, JSON.stringify(errorData, null, 2), 'utf8');
    } catch (error) {
      logger.error(`保存错误记录失败: ${error.message}`);
    }
  }
  
  /**
   * 从文件加载错误记录
   */
  loadErrors() {
    try {
      if (fs.existsSync(this.errorStoragePath)) {
        const data = fs.readFileSync(this.errorStoragePath, 'utf8');
        const errorData = JSON.parse(data);
        
        this.errors = errorData.errors || [];
        this.errorTypeCounts = errorData.errorTypeCounts || {};
        this.errorDateCounts = errorData.errorDateCounts || {};
        
        logger.info(`错误分析器: 已加载 ${this.errors.length} 条错误记录`);
      }
    } catch (error) {
      logger.error(`加载错误记录失败: ${error.message}`);
      // 初始化为空记录
      this.errors = [];
      this.errorTypeCounts = {};
      this.errorDateCounts = {};
    }
  }
}

module.exports = ErrorAnalyzer; 