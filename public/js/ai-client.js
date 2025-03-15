/**
 * AI客户端 - 处理AI指令和API交互
 */
class AiClient {
  constructor() {
    this.status = 'loading';
    this.models = [];
    this.defaultModel = 'openai';
    this.selectedModel = 'openai';
    this.environments = [];
    this.selectedEnvId = '';
    this.maxRetries = 2;
    this.retryDelay = 1000;
    this.pendingRequests = 0;
    
    // 尝试从app全局对象获取选中的环境ID
    if (window.app && window.app.selectedEnvId) {
      console.log(`从app对象获取选中环境ID: ${window.app.selectedEnvId}`);
      this.selectedEnvId = window.app.selectedEnvId;
    } else {
      // 尝试从localStorage获取
      const savedEnvId = localStorage.getItem('selectedEnvId');
      if (savedEnvId) {
        console.log(`从localStorage获取选中环境ID: ${savedEnvId}`);
        this.selectedEnvId = savedEnvId;
      }
    }
    
    // 获取DOM元素（修改为与HTML结构匹配的选择器）
    this.modelSelector = document.querySelector('#ai-model-selector');
    this.envSelector = document.querySelector('#ai-env-selector');
    this.commandInput = document.querySelector('#ai-command-input');
    this.commandButton = document.querySelector('#command-btn');
    this.logsContainer = document.querySelector('#logs-container');
    this.retryButton = document.querySelector('#ai-retry-button');
    this.statusElement = document.querySelector('#ai-status');
    
    // 记录元素状态
    console.log('AI客户端DOM元素状态:');
    console.log(`- 模型选择器: ${this.modelSelector ? '已找到' : '未找到'}`);
    console.log(`- 环境选择器: ${this.envSelector ? '已找到' : '未找到'}`);
    console.log(`- 命令输入框: ${this.commandInput ? '已找到' : '未找到'}`);
    console.log(`- 执行按钮: ${this.commandButton ? '已找到' : '未找到'}`);
    console.log(`- 日志容器: ${this.logsContainer ? '已找到' : '未找到'}`);
    console.log(`- 重试按钮: ${this.retryButton ? '已找到' : '未找到'}`);
    console.log(`- 状态元素: ${this.statusElement ? '已找到' : '未找到'}`);
    
    // 绑定事件
    if (this.commandButton) {
      this.commandButton.addEventListener('click', () => {
        console.log('AI命令按钮被点击，当前选中环境:', this.selectedEnvId);
        // 确保当用户点击执行按钮时，从全局app对象更新selectedEnvId
        if (window.app && window.app.selectedEnvId) {
          this.selectedEnvId = window.app.selectedEnvId;
        }
        this.executeCommand();
      });
    }
    
    if (this.modelSelector) {
      this.modelSelector.addEventListener('change', () => this.switchModel());
    }
    
    if (this.envSelector) {
      this.envSelector.addEventListener('change', () => this.changeEnvironment());
    } else {
      console.log('环境选择器不可用，将通过其他方式选择环境');
    }
    
    if (this.retryButton) {
      this.retryButton.addEventListener('click', () => this.retryConnection());
    }
    
    // 初始化
    this.loadModels();
    
    // 监听环境列表更新事件
    document.addEventListener('environmentListUpdated', (event) => {
      console.log('接收到环境列表更新事件');
      if (event.detail && event.detail.environments) {
        this.environments = event.detail.environments;
        this.updateEnvironmentSelector();
      }
    });
    
    // 启动周期性状态更新
    setTimeout(() => {
      console.log('AI客户端初始化完成，更新状态为ready');
      this.updateStatus('ready');
    }, 3000);
  }

  /**
   * 创建一个状态元素并添加到页面
   */
  createStatusElement() {
    // 找到命令面板
    const commandPanel = document.querySelector('.command-panel');
    if (!commandPanel) {
      console.log('找不到命令面板(.command-panel)');
      return null;
    }
    
    // 检查是否已存在状态元素
    let statusElement = document.querySelector('#ai-status');
    if (statusElement) return statusElement;
    
    // 创建状态元素
    statusElement = document.createElement('div');
    statusElement.id = 'ai-status';
    statusElement.className = 'alert alert-info d-flex align-items-center';
    statusElement.style.marginBottom = '10px';
    
    const statusText = document.createElement('span');
    statusText.className = 'status-text';
    statusText.textContent = '初始化中...';
    
    statusElement.appendChild(statusText);
    
    // 将状态元素添加到命令面板的开头
    const h2 = commandPanel.querySelector('h2');
    if (h2) {
      commandPanel.insertBefore(statusElement, h2.nextSibling);
    } else {
      commandPanel.insertBefore(statusElement, commandPanel.firstChild);
    }
    
    return statusElement;
  }

  /**
   * 加载可用环境列表
   */
  async loadEnvironments() {
    if (!this.envSelector) {
      console.log('缺少环境选择器，无法加载环境');
      return;
    }
    
    try {
      this.log('正在加载环境列表...', 'info');
      const response = await fetch('/api/environments');
      
      if (!response.ok) {
        throw new Error(`环境列表加载失败: ${response.statusText}`);
      }
      
      const environments = await response.json();
      console.log(`加载了 ${environments.length} 个环境`);
      
      this.environments = environments;
      this.updateEnvironmentSelector();
      
      if (environments.length > 0) {
        this.log(`成功加载 ${environments.length} 个环境`, 'info');
      } else {
        this.log('未找到环境', 'warning');
      }
    } catch (error) {
      console.error('加载环境时出错:', error);
      this.log(`加载环境失败: ${error.message}`, 'error');
    }
  }
  
  /**
   * 更新环境选择器
   */
  updateEnvironmentSelector() {
    // 检查环境选择器是否存在
    if (!this.envSelector) {
      console.log('更新环境选择器失败：选择器元素不存在');
      
      // 即使没有选择器，我们仍然可以处理选定的环境ID
      if (this.selectedEnvId) {
        console.log(`使用当前保存的环境ID: ${this.selectedEnvId}`);
        // 确保app全局对象也有这个ID
        if (window.app) {
          window.app.selectedEnvId = this.selectedEnvId;
        }
      } else if (window.app && window.app.selectedEnvId) {
        // 从app对象获取选中的环境ID
        this.selectedEnvId = window.app.selectedEnvId;
        console.log(`从app对象获取环境ID: ${this.selectedEnvId}`);
      }
      
      // 尝试在环境列表中高亮显示选中环境
      this.highlightSelectedEnvironment();
      return;
    }
    
    try {
      console.log(`更新环境选择器，当前有 ${this.environments.length} 个环境`);
      
      // 清空现有选项
      this.envSelector.innerHTML = '';
      
      // 添加默认选项
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = '选择执行环境...';
      this.envSelector.appendChild(defaultOption);
      
      // 检查是否有环境
      if (!this.environments || this.environments.length === 0) {
        console.log('没有可用环境');
        return;
      }
      
      // 添加环境选项
      this.environments.forEach(env => {
        const option = document.createElement('option');
        const envId = env.user_id || env.id;
        const envName = env.name || '未命名';
        const groupName = env.group_name || '默认分组';
        const isRunning = env.is_running === true || 
          (env.status && ['Active', 'Running'].includes(env.status));
        
        option.value = envId;
        option.textContent = `${envName} (${groupName}) - ${isRunning ? '运行中' : '已停止'}`;
        option.disabled = !isRunning;
        
        this.envSelector.appendChild(option);
      });
      
      // 如果有选中的环境ID，设置选择器的值
      if (this.selectedEnvId) {
        console.log(`恢复选择器选中环境: ${this.selectedEnvId}`);
        this.envSelector.value = this.selectedEnvId;
      } else if (window.app && window.app.selectedEnvId) {
        // 从app对象获取选中的环境ID
        this.selectedEnvId = window.app.selectedEnvId;
        console.log(`从app对象获取环境ID: ${this.selectedEnvId}`);
        this.envSelector.value = this.selectedEnvId;
      }
      
      // 高亮显示选中环境
      this.highlightSelectedEnvironment();
      
      console.log(`环境选择器更新完成，选中值: ${this.envSelector.value}`);
    } catch (error) {
      console.error('更新环境选择器失败:', error);
    }
  }

  /**
   * 高亮显示选中的环境
   */
  highlightSelectedEnvironment() {
    if (!this.selectedEnvId) {
      return;
    }
    
    try {
      // 先清除所有已选中的环境
      document.querySelectorAll('.env-item.ai-selected').forEach(item => {
        item.classList.remove('ai-selected');
      });
      
      // 查找并高亮当前选中的环境
      const envItem = document.querySelector(`.env-item[data-id="${this.selectedEnvId}"]`);
      if (envItem) {
        envItem.classList.add('ai-selected');
        console.log(`高亮显示环境: ${this.selectedEnvId}`);
      }
    } catch (error) {
      console.error('高亮显示环境失败:', error);
    }
  }

  /**
   * 加载AI模型列表
   */
  async loadModels() {
    let retryCount = 0;
    const maxRetries = 3;
    
    // 先将状态设为处理中
    this.updateStatus('processing', '正在连接AI服务...');
    
    while (retryCount <= maxRetries) {
      try {
        if (retryCount > 0) {
          console.log(`正在重试加载AI模型 (${retryCount}/${maxRetries})...`);
          // 添加一些延迟，避免立即重试
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
        
        const response = await fetch('/api/ai/models');
        if (!response.ok) {
          throw new Error(`服务器响应错误: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.success) {
          console.log('成功加载AI模型:', data.models.length);
          this.models = data.models;
          this.defaultModel = data.defaultModelId;
          this.selectedModel = data.defaultModelId;
          
          // 检查是否有可用模型
          const hasEnabledModels = this.models.some(model => model.status === 'enabled');
          
          if (hasEnabledModels) {
            this.updateStatus('ready');
            this.updateModelSelector();
            
            // 显示成功通知
            this.showNotification('AI服务连接成功', 'success');
            return; // 成功加载，退出循环
          } else {
            throw new Error('所有AI模型均未配置API密钥');
          }
        } else {
          // API返回了错误
          throw new Error(data.message || '加载AI模型失败');
        }
      } catch (error) {
        console.error(`加载AI模型出错 (尝试 ${retryCount+1}/${maxRetries+1}):`, error);
        
        if (retryCount === maxRetries) {
          // 最后一次尝试也失败了，检查AI状态API
          try {
            console.log('尝试通过状态API检查AI服务...');
            
            const statusResponse = await fetch('/api/ai/status');
            if (statusResponse.ok) {
              const statusData = await statusResponse.json();
              
              if (statusData.success && statusData.available) {
                // AI服务可用，但可能模型API有问题
                this.updateStatus('error', '模型列表加载失败，但AI服务可用');
                this.showNotification('模型列表加载失败，但AI服务可用。请重试或刷新页面。', 'warning');
              } else {
                // AI服务不可用
                this.updateStatus('error', `AI服务不可用: ${statusData.error || '未配置API密钥'}`);
              }
            } else {
              this.updateStatus('error', `连接失败: ${error.message}`);
            }
          } catch (statusError) {
            this.updateStatus('error', `连接失败: ${error.message}`);
          }
          break;
        }
        
        retryCount++;
      }
    }
  }

  /**
   * 更新模型选择器
   */
  updateModelSelector() {
    if (!this.modelSelector) return;
    
    // 清空现有选项
    this.modelSelector.innerHTML = '';
    
    // 添加模型选项
    this.models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      
      // 检查模型是否可用 - 使用新的status字段
      if (model.status === 'disabled') {
        option.disabled = true;
        option.textContent += ' (未配置)';
      }
      
      if (model.id === this.defaultModel) {
        option.selected = true;
      }
      
      this.modelSelector.appendChild(option);
    });
    
    // 输出调试信息
    console.log('更新AI模型选择器:', this.models.map(m => `${m.id}(${m.status})`).join(', '));
  }

  /**
   * 执行AI命令
   */
  async executeCommand() {
    try {
      // 获取命令输入元素
      const commandInput = document.getElementById('command-input');
      if (!commandInput) {
        console.error('找不到命令输入元素');
        this.addLogEntry('错误：找不到命令输入元素', 'error');
        return;
      }

      // 获取命令文本
      const command = commandInput.value.trim();
      if (!command) {
        this.addLogEntry('请输入命令', 'warning');
        return;
      }

      // 获取选中的环境ID
      console.log('从app对象获取环境ID:', app.selectedEnvId);
      const envId = this.selectedEnvId || app.selectedEnvId || localStorage.getItem('selectedEnvId');
      console.log(`执行命令，环境ID: ${envId || '无'}`);

      // 禁用UI元素
      this.disableUI(true);
      this.updateStatus('processing', '正在处理命令...');

      // 构造增强命令，指导AI生成浏览器兼容代码
      let enhancedCommand = command;

      // 如果有选中环境，添加更明确的提示
      if (envId) {
        // 添加提示，指导AI生成纯浏览器JavaScript
        enhancedCommand = `${command}\n\n注意：请生成纯浏览器兼容的JavaScript代码，因为这将在浏览器环境中执行，而不是Node.js环境。
不要使用require()或任何Node.js特有的功能。不要使用puppeteer语法，即使命令中提到了它。
示例：
- 如果需要打开URL，请直接使用: window.location.href = 'https://example.com';
- 如果需要点击元素，请使用: document.querySelector('button').click();
- 如果需要输入文本，请使用: document.querySelector('input').value = '文本';

返回纯JavaScript代码，不要使用Markdown格式。`;
      }

      // 显示临时加载消息
      this.addLogEntry(`正在执行: ${command}`, 'command');
      
      // 发送请求到服务器
      const response = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          command: enhancedCommand,
          model: this.selectedModel,
          envId: envId || null
        })
      });

      // 检查响应
      if (!response.ok) {
        throw new Error(`服务器错误: ${response.status}`);
      }

      // 解析响应数据
      const data = await response.json();
      
      // 移除临时消息
      this.removeLogEntryByType('command');
      
      // 处理结果
      if (data.success) {
        // 显示命令结果
        this.displayCommandResult(data);
        
        // 清空命令输入
        commandInput.value = '';
        
        // 如果有代码执行结果，显示它
        if (data.execution_result) {
          if (data.execution_result.success) {
            this.addLogEntry(`代码执行成功：${data.execution_result.message || ''}`, 'success');
          } else {
            this.addLogEntry(`代码执行失败：${data.execution_result.error || '未知错误'}`, 'error');
          }
        }
      } else {
        this.addLogEntry(`命令执行失败: ${data.error || '未知错误'}`, 'error');
      }
    } catch (error) {
      console.error('执行命令出错:', error);
      this.addLogEntry(`执行命令出错: ${error.message}`, 'error');
    } finally {
      // 重新启用UI元素
      this.disableUI(false);
      this.updateStatus('ready');
    }
  }

  /**
   * 启动环境
   * @param {string} envId 环境ID
   */
  async startEnvironment(envId) {
    if (!envId) {
      console.error('无法启动环境：环境ID为空');
      return false;
    }
    
    try {
      console.log(`尝试启动环境 ${envId}`);
      this.updateStatus('processing', '正在启动环境...');
      
      const response = await fetch(`/api/environment/start/${envId}`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error(`启动环境请求失败: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        console.log(`环境 ${envId} 启动成功`);
        this.updateStatus('ready');
        return true;
      } else {
        console.error(`环境启动失败:`, data.message);
        this.updateStatus('error', `环境启动失败: ${data.message}`);
        return false;
      }
    } catch (error) {
      console.error(`环境 ${envId} 启动失败:`, error);
      this.updateStatus('error', `环境启动失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 格式化AI响应（支持代码高亮等）
   */
  formatAiResponse(text) {
    if (!text) return '';
    
    // 替换代码块
    let formattedText = text.replace(/```(\w*)\n([\s\S]*?)```/g, (match, language, code) => {
      return `<pre class="code-block${language ? ' language-'+language : ''}"><code>${this.escapeHtml(code)}</code></pre>`;
    });
    
    // 替换换行符
    formattedText = formattedText.replace(/\n/g, '<br>');
    
    return formattedText;
  }

  /**
   * 转义HTML特殊字符
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 添加日志条目
   */
  addLogEntry(message, type = 'info') {
    if (!this.logsContainer) return;
    
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.innerHTML = message;
    entry.dataset.logType = type;
    
    // 添加时间戳
    const timestamp = new Date().toLocaleTimeString();
    const timeElement = document.createElement('span');
    timeElement.className = 'log-time';
    timeElement.textContent = timestamp;
    entry.prepend(timeElement);
    
    this.logsContainer.appendChild(entry);
    this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
  }

  /**
   * 移除指定类型的日志条目
   * @param {string} type 日志类型
   */
  removeLogEntryByType(type) {
    if (!this.logsContainer) return;
    
    const entries = this.logsContainer.querySelectorAll(`.log-entry[data-log-type="${type}"]`);
    entries.forEach(entry => entry.remove());
  }

  /**
   * 更新AI状态
   * @param {string} status 新状态
   * @param {string} message 状态消息
   */
  updateStatus(status, message = '') {
    this.status = status;
    console.log(`AI客户端状态更新: ${status}${message ? ' - ' + message : ''}`);
    
    // 使用main.js中的updateAIStatus函数
    if (window.updateAIStatus) {
      window.updateAIStatus(status, message);
      return;
    }
    
    // 如果main.js中的函数不存在，则尝试自己更新
    if (!this.statusElement) {
      this.statusElement = document.querySelector('#ai-status');
      if (!this.statusElement) {
        console.error('找不到AI状态元素(#ai-status)');
        return;
      }
    }
    
    // 找到或创建状态指示器和文本元素
    let statusIndicator = this.statusElement.querySelector('.status-indicator');
    let statusText = this.statusElement.querySelector('.status-text');
    
    if (!statusIndicator) {
      statusIndicator = document.createElement('span');
      statusIndicator.className = 'status-indicator';
      this.statusElement.appendChild(statusIndicator);
    }
    
    if (!statusText) {
      statusText = document.createElement('span');
      statusText.className = 'status-text ms-2';
      this.statusElement.appendChild(statusText);
    }
    
    // 更新状态文本和样式
    switch (status) {
      case 'ready':
        statusText.textContent = '就绪';
        this.statusElement.className = 'alert alert-success d-flex align-items-center mb-3';
        statusIndicator.className = 'status-indicator ready';
        if (this.commandButton) this.commandButton.disabled = false;
        if (this.commandInput) this.commandInput.disabled = false;
        break;
        
      case 'processing':
        statusText.textContent = '处理中...';
        this.statusElement.className = 'alert alert-warning d-flex align-items-center mb-3';
        statusIndicator.className = 'status-indicator loading';
        if (this.commandButton) this.commandButton.disabled = true;
        if (this.commandInput) this.commandInput.disabled = true;
        break;
        
      case 'error':
        statusText.textContent = message || '错误';
        this.statusElement.className = 'alert alert-danger d-flex align-items-center mb-3';
        statusIndicator.className = 'status-indicator error';
        if (this.commandButton) this.commandButton.disabled = false;
        if (this.commandInput) this.commandInput.disabled = false;
        break;
    }
  }

  /**
   * 显示通知
   */
  showNotification(message, type = 'info') {
    // 检查是否有window.app的showNotification函数
    if (window.app && typeof window.app.showNotification === 'function') {
      window.app.showNotification(message, type);
      return;
    }
    
    // 备用实现
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <div class="notification-message">${message}</div>
        <button class="notification-close">&times;</button>
      </div>
    `;
    
    // 添加到文档
    let container = document.getElementById('notification-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notification-container';
      document.body.appendChild(container);
    }
    
    container.appendChild(notification);
    
    // 自动关闭
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 500);
    }, 5000);
    
    // 点击关闭
    const closeButton = notification.querySelector('.notification-close');
    if (closeButton) {
      closeButton.addEventListener('click', () => notification.remove());
    }
  }

  /**
   * 禁用/启用UI元素
   * @param {boolean} disabled 是否禁用
   */
  disableUI(disabled) {
    // 禁用命令按钮
    const commandButton = document.getElementById('command-button');
    if (commandButton) {
      commandButton.disabled = disabled;
    }
    
    // 禁用命令输入框
    const commandInput = document.getElementById('command-input');
    if (commandInput) {
      commandInput.disabled = disabled;
      if (!disabled) {
        // 重新获得焦点
        commandInput.focus();
      }
    }
    
    // 禁用环境选择器
    const envSelector = document.getElementById('env-selector');
    if (envSelector) {
      envSelector.disabled = disabled;
    }
    
    // 禁用模型选择器
    const modelSelector = document.getElementById('model-selector');
    if (modelSelector) {
      modelSelector.disabled = disabled;
    }
  }

  /**
   * 重新连接AI服务 - 公共方法
   */
  retryConnection() {
    console.log('手动重试连接AI服务...');
    
    // 先更新状态为处理中
    this.updateStatus('processing', '正在重新连接...');
    
    // 移除所有错误日志
    this.removeLogEntryByType('error');
    this.addLogEntry('正在重新连接AI服务...', 'info');
    
    // 重新加载模型
    this.loadModels().then(() => {
      this.addLogEntry('AI服务重新连接成功', 'info');
    }).catch(error => {
      this.addLogEntry(`重新连接失败: ${error.message}`, 'error');
    });
  }
  
  /**
   * 刷新环境列表
   */
  refreshEnvironments() {
    this.loadEnvironments();
  }

  /**
   * 切换AI模型
   */
  switchModel() {
    if (!this.modelSelector) return;
    this.selectedModel = this.modelSelector.value;
    console.log(`已切换模型至: ${this.selectedModel}`);
  }
  
  /**
   * 更改执行环境
   */
  changeEnvironment() {
    if (!this.envSelector) return;
    this.selectedEnvId = this.envSelector.value;
    console.log(`已选择环境: ${this.selectedEnvId || '无环境'}`);
  }

  /**
   * 添加日志信息
   * @param {string} message - 日志消息
   * @param {string} level - 日志级别：info, warning, error, success, pending
   */
  log(message, level = 'info') {
    // 记录到控制台
    switch(level) {
      case 'error':
        console.error(message);
        break;
      case 'warning':
        console.warn(message);
        break;
      case 'success':
        console.log(`✅ ${message}`);
        break;
      default:
        console.log(message);
    }
    
    // 添加到日志容器
    this.addLogEntry(message, level);
  }

  /**
   * 显示命令执行结果
   * @param {Object} data 命令执行结果数据
   */
  displayCommandResult(data) {
    if (!this.logsContainer) {
      console.error('无法显示命令结果：日志容器不存在');
      return;
    }
    
    // 创建结果元素
    const resultElement = document.createElement('div');
    resultElement.className = `alert ${data.success ? 'alert-success' : 'alert-danger'} mt-2`;
    
    // 设置结果内容
    resultElement.innerHTML = `
      <div class="d-flex justify-content-between align-items-top">
        <div>${data.message || (data.success ? '命令执行成功' : '命令执行失败')}</div>
        <button type="button" class="btn-close" aria-label="关闭"></button>
      </div>
    `;
    
    // 如果有执行结果信息，添加状态标签
    if (data.executionSuccess !== undefined) {
      const statusBadge = document.createElement('span');
      statusBadge.className = `badge bg-${data.executionSuccess ? 'success' : 'warning'} ms-2`;
      statusBadge.textContent = data.executionSuccess ? '代码已在浏览器中执行' : '代码执行失败';
      resultElement.querySelector('.d-flex div').appendChild(statusBadge);
      
      // 如果有执行消息，添加到内容中
      if (data.executionMessage) {
        const execMsg = document.createElement('div');
        execMsg.className = 'mt-2 small text-muted';
        execMsg.textContent = `执行状态: ${data.executionMessage}`;
        resultElement.querySelector('.d-flex').after(execMsg);
      }
    }
    
    // 如果有详细结果，添加到内容中
    if (data.result) {
      // 创建代码容器
      const resultContent = document.createElement('div');
      resultContent.className = 'mt-2 p-2 bg-light rounded';
      resultContent.style.whiteSpace = 'pre-wrap';
      resultContent.style.fontSize = '0.9em';
      
      // 尝试提取和格式化代码
      const codeMatch = data.result.match(/```(?:javascript|js)?\s*([\s\S]*?)```/);
      if (codeMatch) {
        const code = codeMatch[1].trim();
        resultContent.innerHTML = `<div class="fw-bold mb-1">生成的代码:</div><pre class="code-block m-0 p-2 bg-dark text-light rounded"><code>${this.escapeHtml(code)}</code></pre>`;
      } else {
        resultContent.textContent = data.result;
      }
      
      resultElement.querySelector('.d-flex').after(resultContent);
    }
    
    // 添加关闭按钮事件
    const closeButton = resultElement.querySelector('.btn-close');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        resultElement.remove();
      });
    }
    
    // 添加到结果容器
    this.logsContainer.appendChild(resultElement);
    
    // 自动滚动到底部
    this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
  }
}

// 初始化AI客户端
document.addEventListener('DOMContentLoaded', () => {
  window.aiClient = new AiClient();
  
  // 监听环境列表变化，自动刷新环境选择器
  document.addEventListener('environmentListUpdated', () => {
    if (window.aiClient) {
      window.aiClient.refreshEnvironments();
    }
  });
});

// AI状态初始化
function initAiStatus() {
  const statusElement = document.getElementById('ai-status');
  if (!statusElement) return;
  
  fetch('/api/ai/status')
    .then(response => response.json())
    .then(status => {
      console.log('AI API状态:', status);
      
      // 更新模型选择器
      const modelSelector = document.getElementById('ai-model-selector');
      if (modelSelector) {
        // 如果OpenAI未配置，禁用此选项
        const openaiOption = modelSelector.querySelector('option[value="openai"]');
        if (openaiOption) {
          openaiOption.textContent = 'OpenAI GPT-4' + (status.openai.configured ? '' : ' (未配置)');
          openaiOption.disabled = !status.openai.configured;
        }
        
        // 如果DeepSeek未配置，禁用此选项
        const deepseekOption = modelSelector.querySelector('option[value="deepseek"]');
        if (deepseekOption) {
          deepseekOption.textContent = 'DeepSeek' + (status.deepseek.configured ? '' : ' (未配置)');
          deepseekOption.disabled = !status.deepseek.configured;
        }
        
        // 设置默认模型
        modelSelector.value = status.defaultModel;
      }
      
      // 如果两者都未配置，显示配置提示
      if (!status.openai.configured && !status.deepseek.configured) {
        setAiStatus('error', 'API密钥未配置，请先配置API密钥', false);
        
        // 禁用AI命令输入
        const commandInput = document.getElementById('ai-command-input');
        const commandBtn = document.getElementById('command-btn');
        
        if (commandInput) {
          commandInput.disabled = true;
          commandInput.placeholder = '请先配置AI API密钥才能使用此功能';
        }
        
        if (commandBtn) {
          commandBtn.disabled = true;
          commandBtn.innerHTML = '<i class="fas fa-cog"></i> 配置API密钥';
          
          // 点击按钮转到设置页面
          commandBtn.addEventListener('click', () => {
            window.location.href = '/settings';
          });
        }
        
        // 添加设置链接
        const aiStatus = document.getElementById('ai-status');
        if (aiStatus) {
          aiStatus.innerHTML = `
            <div class="alert alert-warning">
              <i class="fas fa-exclamation-triangle"></i> 
              AI功能未配置。请<a href="/settings" class="alert-link">配置API密钥</a>以启用AI辅助功能。
            </div>
          `;
        }
      } else {
        // 至少有一个API配置，设置正常状态
        setAiStatus('ready', '就绪，请输入指令', true);
      }
    })
    .catch(error => {
      console.error('获取AI状态失败:', error);
      setAiStatus('error', '无法获取AI状态', false);
    });
}

// 初始化 - 页面加载时调用
document.addEventListener('DOMContentLoaded', () => {
  console.log('AI客户端初始化');
  initAiStatus();
  
  // 初始化命令按钮
  const commandBtn = document.getElementById('command-btn');
  if (commandBtn) {
    commandBtn.addEventListener('click', executeAiCommand);
  }
});

// 执行AI命令
async function executeAiCommand() {
  const commandInput = document.getElementById('ai-command-input');
  const envSelector = document.getElementById('ai-env-selector');
  const modelSelector = document.getElementById('ai-model-selector');
  
  if (!commandInput || !commandInput.value.trim()) {
    alert('请输入指令');
    return;
  }
  
  const command = commandInput.value.trim();
  const selectedEnv = envSelector ? envSelector.value : null;
  const selectedModel = modelSelector ? modelSelector.value : 'openai';
  
  // 设置处理中状态
  setAiStatus('processing', '正在处理指令...', false);
  addLogEntry(`执行指令: ${command}`, 'info');
  
  try {
    // 发送到服务器
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: command,
        model: selectedModel,
        environmentId: selectedEnv
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      // 检查是否需要配置
      if (data.needsConfiguration) {
        addLogEntry(`错误: ${data.error}`, 'error');
        
        if (confirm(`${data.error}，是否现在去配置?`)) {
          window.location.href = data.configUrl || '/settings';
        }
        
        setAiStatus('error', data.error, true);
        return;
      }
      
      throw new Error(data.error || '请求失败');
    }
    
    // 处理响应
    if (data.success) {
      addLogEntry(`AI响应: ${data.response}`, 'success');
      setAiStatus('ready', '就绪，请输入指令', true);
    } else {
      addLogEntry(`错误: ${data.error}`, 'error');
      setAiStatus('error', data.error, true);
    }
  } catch (error) {
    console.error('AI执行指令失败:', error);
    addLogEntry(`执行失败: ${error.message}`, 'error');
    setAiStatus('error', error.message, true);
  }
} 