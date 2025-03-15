// 任务运行器模块 - 负责执行自动化任务序列
const logger = require('./logger');
const { v4: uuidv4 } = require('uuid');

class TaskRunner {
  constructor(browserController) {
    this.browserController = browserController;
    this.taskId = null;
    this.status = 'idle';
    this.progress = 0;
    this.result = null;
    this.error = null;
    this.startTime = null;
    this.endTime = null;
    this.currentAction = null;
    this.actionHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * 运行任务序列
   * @param {Array} actions 操作数组
   * @param {Object} options 任务选项
   * @returns {Promise} 任务执行结果
   */
  async runTask(actions, options = {}) {
    if (!this.browserController || !this.browserController.isConnected()) {
      logger.error('浏览器未连接');
      throw new Error('浏览器未连接');
    }
    
    // 重置任务状态
    this.resetTaskState();
    
    // 初始化任务
    this.taskId = options.taskId || uuidv4();
    this.status = 'running';
    this.startTime = new Date();
    
    logger.info(`开始执行任务 (ID: ${this.taskId}), 共 ${actions.length} 个操作`);
    
    try {
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        this.progress = Math.floor((i / actions.length) * 100);
        this.currentAction = action;
        
        logger.info(`执行操作 ${i+1}/${actions.length}: ${action.type}`);
        
        // 执行操作
        await this.executeAction(action);
        
        // 记录操作历史
        this.recordActionHistory({
          ...action,
          status: 'success',
          timestamp: new Date()
        });
      }
      
      // 任务成功完成
      this.progress = 100;
      this.status = 'completed';
      this.endTime = new Date();
      this.result = { success: true };
      
      const duration = (this.endTime - this.startTime) / 1000;
      logger.info(`任务执行完成 (ID: ${this.taskId}), 耗时: ${duration}秒`);
      
      return this.result;
    } catch (error) {
      // 任务执行失败
      this.status = 'failed';
      this.endTime = new Date();
      this.error = {
        message: error.message,
        action: this.currentAction
      };
      
      // 记录失败的操作历史
      if (this.currentAction) {
        this.recordActionHistory({
          ...this.currentAction,
          status: 'failed',
          error: error.message,
          timestamp: new Date()
        });
      }
      
      const duration = (this.endTime - this.startTime) / 1000;
      logger.error(`任务执行失败 (ID: ${this.taskId}), 耗时: ${duration}秒, 错误: ${error.message}`);
      
      throw error;
    }
  }
  
  /**
   * 执行单个操作
   * @param {Object} action 操作对象
   * @returns {Promise} 操作执行结果
   */
  async executeAction(action) {
    if (!action || !action.type) {
      throw new Error('无效的操作: 缺少类型');
    }
    
    switch (action.type) {
      case 'navigate':
        if (!action.url) {
          throw new Error('navigate操作缺少url参数');
        }
        return await this.browserController.navigate(action.url, action.options);
        
      case 'wait':
        const waitTime = action.time || 1000;
        logger.debug(`等待 ${waitTime}ms`);
        return await new Promise(resolve => setTimeout(resolve, waitTime));
        
      case 'click':
        if (!action.selector) {
          throw new Error('click操作缺少selector参数');
        }
        return await this.browserController.click(action.selector, action.options);
        
      case 'type':
        if (!action.selector || action.text === undefined) {
          throw new Error('type操作缺少selector或text参数');
        }
        return await this.browserController.type(action.selector, action.text, action.options);
        
      case 'screenshot':
        return await this.browserController.screenshot(action.options);
        
      case 'evaluate':
        if (!action.script) {
          throw new Error('evaluate操作缺少script参数');
        }
        return await this.browserController.executeScript(action.script, action.context);
        
      case 'waitForElement':
        if (!action.selector) {
          throw new Error('waitForElement操作缺少selector参数');
        }
        return await this.browserController.waitForElement(action.selector, action.options);
        
      default:
        throw new Error(`未知的操作类型: ${action.type}`);
    }
  }
  
  /**
   * 重置任务状态
   */
  resetTaskState() {
    this.status = 'idle';
    this.progress = 0;
    this.result = null;
    this.error = null;
    this.startTime = null;
    this.endTime = null;
    this.currentAction = null;
    // 不清空历史记录，只在实例化时清空
  }
  
  /**
   * 获取任务状态
   * @returns {Object} 任务状态对象
   */
  getTaskStatus() {
    return {
      taskId: this.taskId,
      status: this.status,
      progress: this.progress,
      currentAction: this.currentAction,
      result: this.result,
      error: this.error,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.startTime && (this.endTime || new Date()) - this.startTime
    };
  }
  
  /**
   * 记录操作历史
   * @param {Object} actionEntry 操作记录
   */
  recordActionHistory(actionEntry) {
    this.actionHistory.unshift(actionEntry);
    
    // 限制历史记录大小
    if (this.actionHistory.length > this.maxHistorySize) {
      this.actionHistory.pop();
    }
  }
  
  /**
   * 获取操作历史
   * @returns {Array} 操作历史数组
   */
  getActionHistory() {
    return this.actionHistory;
  }
  
  /**
   * 停止正在执行的任务
   */
  stopTask() {
    if (this.status === 'running') {
      this.status = 'stopped';
      this.endTime = new Date();
      logger.info(`任务已手动停止 (ID: ${this.taskId})`);
    }
  }
}

module.exports = TaskRunner;
