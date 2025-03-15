// 录制管理器模块 - 负责管理浏览器任务的录制
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class RecordingManager {
  constructor(options = {}) {
    this.browserUseApi = options.browserUseApi; // Browser Use API实例
    this.recordingsPath = options.recordingsPath || path.join(__dirname, '..', 'recordings');
    this.recordings = [];
    this.maxStorageSize = options.maxStorageSize || 1024 * 1024 * 1000; // 默认1GB
    this.currentStorageSize = 0;
    
    // 确保录制目录存在
    this.ensureRecordingDirectory();
    
    // 加载已有录制信息
    this.loadRecordings();
  }
  
  /**
   * 确保录制目录存在
   */
  ensureRecordingDirectory() {
    try {
      if (!fs.existsSync(this.recordingsPath)) {
        fs.mkdirSync(this.recordingsPath, { recursive: true });
        logger.info(`创建录制目录: ${this.recordingsPath}`);
      }
    } catch (error) {
      logger.error(`创建录制目录失败: ${error.message}`);
    }
  }
  
  /**
   * 加载已有录制信息
   */
  loadRecordings() {
    try {
      this.recordings = [];
      this.currentStorageSize = 0;
      
      // 如果Browser Use API实例可用，使用API获取录制列表
      if (this.browserUseApi) {
        this.refreshRecordingsFromApi();
        return;
      }
      
      // 否则从文件系统读取
      const files = fs.readdirSync(this.recordingsPath);
      
      for (const file of files) {
        if (file.endsWith('.mp4') || file.endsWith('.webm')) {
          const filePath = path.join(this.recordingsPath, file);
          const stats = fs.statSync(filePath);
          
          this.recordings.push({
            id: path.basename(file, path.extname(file)),
            name: file,
            path: filePath,
            size: stats.size,
            created: stats.birthtime,
            duration: null, // 无法从文件系统获取视频时长
          });
          
          this.currentStorageSize += stats.size;
        }
      }
      
      logger.info(`加载了 ${this.recordings.length} 个录制，总大小: ${this.formatSize(this.currentStorageSize)}`);
    } catch (error) {
      logger.error(`加载录制信息失败: ${error.message}`);
    }
  }
  
  /**
   * 从Browser Use API刷新录制列表
   */
  async refreshRecordingsFromApi() {
    if (!this.browserUseApi) {
      logger.error('无法从API刷新录制列表: Browser Use API实例未提供');
      return;
    }
    
    try {
      const response = await this.browserUseApi.listRecordings(this.recordingsPath);
      
      if (response && response.recordings) {
        this.recordings = response.recordings.map(rec => ({
          id: rec.id || path.basename(rec.path, path.extname(rec.path)),
          name: path.basename(rec.path),
          path: rec.path,
          size: rec.size || 0,
          created: new Date(rec.created_at || Date.now()),
          duration: rec.duration || null,
          taskId: rec.task_id || null
        }));
        
        this.currentStorageSize = this.recordings.reduce((total, rec) => total + rec.size, 0);
        
        logger.info(`从API加载了 ${this.recordings.length} 个录制，总大小: ${this.formatSize(this.currentStorageSize)}`);
      } else {
        logger.warn('从API获取录制列表返回无效响应');
      }
    } catch (error) {
      logger.error(`从API刷新录制列表失败: ${error.message}`);
    }
  }
  
  /**
   * 启用录制
   * @param {Object} options 录制选项
   * @returns {Object} 录制配置
   */
  enableRecording(options = {}) {
    const defaultOptions = {
      taskId: null,
      environmentId: null,
      fileName: `recording_${Date.now()}.webm`,
      width: 1280,
      height: 720,
      frameRate: 30
    };
    
    const recordingOptions = { ...defaultOptions, ...options };
    
    // 确保文件名唯一
    if (!recordingOptions.fileName.includes(Date.now())) {
      const ext = path.extname(recordingOptions.fileName);
      const baseName = path.basename(recordingOptions.fileName, ext);
      recordingOptions.fileName = `${baseName}_${Date.now()}${ext}`;
    }
    
    recordingOptions.path = path.join(this.recordingsPath, recordingOptions.fileName);
    
    logger.info(`启用录制: ${recordingOptions.fileName}`);
    
    return {
      save_recording: true,
      save_recording_path: this.recordingsPath,
      recording_options: recordingOptions
    };
  }
  
  /**
   * 获取所有录制
   * @returns {Array} 录制列表
   */
  getAllRecordings() {
    return this.recordings;
  }
  
  /**
   * 获取特定任务的录制
   * @param {string} taskId 任务ID
   * @returns {Array} 录制列表
   */
  getRecordingsByTask(taskId) {
    return this.recordings.filter(rec => rec.taskId === taskId);
  }
  
  /**
   * 通过ID获取录制
   * @param {string} id 录制ID
   * @returns {Object} 录制信息
   */
  getRecordingById(id) {
    return this.recordings.find(rec => rec.id === id);
  }
  
  /**
   * 删除录制
   * @param {string} id 录制ID
   * @returns {boolean} 是否成功
   */
  deleteRecording(id) {
    const recording = this.getRecordingById(id);
    
    if (!recording) {
      logger.warn(`未找到要删除的录制: ${id}`);
      return false;
    }
    
    try {
      fs.unlinkSync(recording.path);
      this.currentStorageSize -= recording.size;
      this.recordings = this.recordings.filter(rec => rec.id !== id);
      logger.info(`已删除录制: ${recording.name}`);
      return true;
    } catch (error) {
      logger.error(`删除录制失败: ${error.message}`);
      return false;
    }
  }
  
  /**
   * 清理旧录制以释放空间
   * @param {number} targetSize 目标大小（字节）
   * @returns {number} 释放的空间大小
   */
  cleanupOldRecordings(targetSize = this.maxStorageSize * 0.8) {
    if (this.currentStorageSize <= targetSize) {
      return 0;
    }
    
    // 按创建时间排序
    const sortedRecordings = [...this.recordings].sort((a, b) => 
      a.created.getTime() - b.created.getTime()
    );
    
    let freedSpace = 0;
    
    while (this.currentStorageSize > targetSize && sortedRecordings.length > 0) {
      const oldestRecording = sortedRecordings.shift();
      if (this.deleteRecording(oldestRecording.id)) {
        freedSpace += oldestRecording.size;
      }
    }
    
    logger.info(`清理了旧录制，释放空间: ${this.formatSize(freedSpace)}`);
    return freedSpace;
  }
  
  /**
   * 获取录制详情（包括存储统计信息）
   * @returns {Object} 录制详情
   */
  getRecordingStats() {
    return {
      totalRecordings: this.recordings.length,
      totalSize: this.currentStorageSize,
      formattedSize: this.formatSize(this.currentStorageSize),
      maxStorageSize: this.maxStorageSize,
      formattedMaxSize: this.formatSize(this.maxStorageSize),
      usagePercentage: (this.currentStorageSize / this.maxStorageSize) * 100,
      recordingsPath: this.recordingsPath,
      recentRecordings: this.recordings
        .sort((a, b) => b.created.getTime() - a.created.getTime())
        .slice(0, 5)
    };
  }
  
  /**
   * 格式化字节大小为人类可读格式
   * @param {number} bytes 字节数
   * @returns {string} 格式化后的大小
   */
  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = RecordingManager; 