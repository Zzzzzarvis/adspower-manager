// 状态管理器模块 - 负责管理环境状态
const logger = require('./logger');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

class StateManager extends EventEmitter {
  constructor(envId, options = {}) {
    super();
    this.envId = envId;
    this.storageDir = options.storageDir || path.join(__dirname, '..', 'config', 'states');
    this.storageFile = path.join(this.storageDir, `${envId}.json`);
    
    // 初始状态
    this.state = {
      envId,
      status: 'stopped',
      lastActivity: null,
      lastError: null,
      notes: '',
      tags: [],
      tasks: [],
      custom: {},
      stats: {
        startCount: 0,
        errorCount: 0,
        totalRuntime: 0,
        lastStartTime: null,
        lastStopTime: null
      }
    };
    
    // 加载之前的状态
    this.loadState();
  }
  
  /**
   * 更新状态
   * @param {object} updates 要更新的状态字段
   * @param {boolean} emitEvent 是否触发状态更改事件
   * @returns {object} 更新后的状态
   */
  updateState(updates, emitEvent = true) {
    const oldState = { ...this.state };
    
    // 更新主状态
    if (updates.status && updates.status !== this.state.status) {
      this.state.status = updates.status;
      
      // 记录启动和停止时间
      if (updates.status === 'running') {
        this.state.stats.lastStartTime = new Date();
        this.state.stats.startCount++;
      } else if (updates.status === 'stopped' && this.state.stats.lastStartTime) {
        this.state.stats.lastStopTime = new Date();
        const runtime = (this.state.stats.lastStopTime - this.state.stats.lastStartTime) / 1000;
        this.state.stats.totalRuntime += runtime;
      }
    }
    
    // 更新最后活动时间
    this.state.lastActivity = updates.lastActivity || new Date();
    
    // 更新错误信息
    if (updates.error) {
      this.state.lastError = {
        message: updates.error.message || updates.error,
        time: new Date(),
        context: updates.error.context
      };
      this.state.stats.errorCount++;
    }
    
    // 更新备注
    if (updates.notes !== undefined) {
      this.state.notes = updates.notes;
    }
    
    // 更新标签
    if (updates.tags) {
      this.state.tags = updates.tags;
    } else if (updates.addTag) {
      if (!this.state.tags.includes(updates.addTag)) {
        this.state.tags.push(updates.addTag);
      }
    } else if (updates.removeTag) {
      this.state.tags = this.state.tags.filter(tag => tag !== updates.removeTag);
    }
    
    // 更新任务
    if (updates.task) {
      this.state.tasks.unshift({
        id: updates.task.id || `task_${Date.now()}`,
        name: updates.task.name,
        status: updates.task.status || 'pending',
        startTime: updates.task.startTime || new Date(),
        endTime: updates.task.endTime,
        result: updates.task.result
      });
      
      // 限制任务历史记录数
      if (this.state.tasks.length > 50) {
        this.state.tasks = this.state.tasks.slice(0, 50);
      }
    }
    
    // 更新自定义数据
    if (updates.custom) {
      this.state.custom = { ...this.state.custom, ...updates.custom };
    }
    
    // 保存状态
    this.saveState();
    
    // 触发状态更改事件
    if (emitEvent) {
      this.emit('stateChanged', this.state, oldState);
      
      // 如果状态发生变化，也触发特定事件
      if (oldState.status !== this.state.status) {
        this.emit(`status:${this.state.status}`, this.state);
      }
      
      if (updates.error) {
        this.emit('error', this.state.lastError);
      }
    }
    
    return this.state;
  }
  
  /**
   * 获取当前状态
   * @returns {object} 当前状态
   */
  getState() {
    return { ...this.state };
  }
  
  /**
   * 重置状态
   * @param {boolean} keepNotes 是否保留备注
   * @param {boolean} keepTags 是否保留标签
   * @returns {object} 重置后的状态
   */
  resetState(keepNotes = true, keepTags = true) {
    const notes = keepNotes ? this.state.notes : '';
    const tags = keepTags ? this.state.tags : [];
    
    this.state = {
      envId: this.envId,
      status: 'stopped',
      lastActivity: new Date(),
      lastError: null,
      notes,
      tags,
      tasks: [],
      custom: {},
      stats: {
        startCount: 0,
        errorCount: 0,
        totalRuntime: 0,
        lastStartTime: null,
        lastStopTime: null
      }
    };
    
    this.saveState();
    this.emit('stateReset', this.state);
    
    return this.state;
  }
  
  /**
   * 添加任务记录
   * @param {object} task 任务信息
   * @returns {object} 更新后的状态
   */
  addTask(task) {
    return this.updateState({ task });
  }
  
  /**
   * 更新任务状态
   * @param {string} taskId 任务ID
   * @param {object} updates 任务更新
   * @returns {object} 更新后的状态
   */
  updateTask(taskId, updates) {
    const taskIndex = this.state.tasks.findIndex(task => task.id === taskId);
    
    if (taskIndex === -1) {
      logger.warn(`尝试更新不存在的任务: ${taskId}`);
      return this.state;
    }
    
    // 更新任务
    this.state.tasks[taskIndex] = {
      ...this.state.tasks[taskIndex],
      ...updates
    };
    
    // 如果任务完成，设置结束时间
    if (updates.status === 'completed' || updates.status === 'failed') {
      this.state.tasks[taskIndex].endTime = updates.endTime || new Date();
    }
    
    this.saveState();
    this.emit('taskUpdated', this.state.tasks[taskIndex]);
    
    return this.state;
  }
  
  /**
   * 保存状态到文件
   */
  saveState() {
    try {
      // 确保目录存在
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      
      fs.writeFileSync(this.storageFile, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (error) {
      logger.error(`保存环境状态失败 (${this.envId}): ${error.message}`);
    }
  }
  
  /**
   * 从文件加载状态
   */
  loadState() {
    try {
      if (fs.existsSync(this.storageFile)) {
        const data = fs.readFileSync(this.storageFile, 'utf8');
        const loadedState = JSON.parse(data);
        
        // 合并加载的状态，保留当前配置
        this.state = {
          ...loadedState,
          envId: this.envId // 确保环境ID不变
        };
        
        logger.info(`加载了环境状态 (${this.envId})`);
      }
    } catch (error) {
      logger.error(`加载环境状态失败 (${this.envId}): ${error.message}`);
    }
  }
  
  /**
   * 删除状态文件
   */
  deleteState() {
    try {
      if (fs.existsSync(this.storageFile)) {
        fs.unlinkSync(this.storageFile);
        logger.info(`删除了环境状态文件 (${this.envId})`);
      }
    } catch (error) {
      logger.error(`删除环境状态文件失败 (${this.envId}): ${error.message}`);
    }
  }
}

module.exports = StateManager; 