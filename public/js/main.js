/**
 * AdsPower管理器 - 主JavaScript文件
 * 
 * 负责处理环境列表、环境控制和UI交互
 */

// 全局状态
const app = {
  environments: [],
  selectedEnvId: null,
  aiStatus: 'ready', // ready, processing, error
  socket: null,
  modals: {},
  errorChartInstance: null,
  uiState: 'loading', // loading, loaded, error
  connectionStatus: 'unknown', // unknown, connected, error
  environmentCounts: {
    total: 0,
    running: 0,
    expected: 0
  }
};

// 消息显示控制
let messageTimeout = null;

// 暴露主要函数为全局函数，便于调试
window.app = app;
window.fetchEnvironmentList = fetchEnvironmentList;
window.renderEnvironmentList = renderEnvironmentList;
window.startEnvironment = startEnvironment;
window.stopEnvironment = stopEnvironment;

// 添加全局调试函数
window.debugApp = function() {
  console.log('==== 应用状态调试 ====');
  console.log('应用状态:', app);
  console.log('环境列表:', app.environments);
  console.log('选中环境:', app.selectedEnvId);
  console.log('UI状态:', app.uiState);
  
  // 检查DOM元素
  const envListEl = document.getElementById('env-list');
  console.log('环境列表容器:', envListEl);
  
  // 测试API连接
  fetch('/api/environments')
    .then(response => response.text())
    .then(text => {
      console.log('API响应:', text);
      try {
        const data = JSON.parse(text);
        console.log('解析后数据:', data);
      } catch (e) {
        console.error('JSON解析失败:', e);
      }
    })
    .catch(err => {
      console.error('API请求失败:', err);
    });
    
  return '调试信息已输出到控制台';
};

/**
 * 强制刷新浏览器缓存
 */
function forceCacheRefresh() {
  console.log('正在强制刷新缓存...');

  // 添加一个时间戳参数到CSS和JS文件的URL
  const timestamp = new Date().getTime();
  const fileTypes = ['js', 'css'];
  
  fileTypes.forEach(type => {
    const links = document.querySelectorAll(`link[rel="stylesheet"], script[src*=".${type}"]`);
    links.forEach(link => {
      const url = new URL(link.href || link.src, window.location.href);
      
      // 移除旧的时间戳参数(如果有)
      url.searchParams.delete('_t');
      
      // 添加新的时间戳参数
      url.searchParams.append('_t', timestamp);
      
      // 更新链接属性
      if (link.tagName.toLowerCase() === 'link') {
        link.href = url.toString();
      } else {
        link.src = url.toString();
      }
    });
  });
  
  console.log('缓存刷新完成，将在3秒后刷新页面...');
  
  // 延迟3秒后刷新页面
  setTimeout(() => {
    console.log('执行页面刷新...');
    window.location.reload(true);
  }, 3000);
}

/**
 * 初始化页面
 */
document.addEventListener('DOMContentLoaded', function() {
  console.log('页面加载完成，初始化应用...');
  
  // 检查URL中是否有强制刷新参数
  const urlParams = new URLSearchParams(window.location.search);
  const forceRefresh = urlParams.get('force_refresh');
  
  if (forceRefresh === 'true') {
    console.log('检测到强制刷新参数，开始刷新缓存...');
    forceCacheRefresh();
    return; // 避免初始化其他功能
  }
  
  try {
    // 如果AI状态有错误，自动尝试刷新缓存
    const aiStatus = document.getElementById('ai-status');
    if (aiStatus && aiStatus.classList.contains('error')) {
      console.log('检测到AI状态错误，将在10秒后尝试刷新缓存...');
      
      // 添加刷新按钮
      const refreshButton = document.createElement('button');
      refreshButton.textContent = '刷新页面清除缓存';
      refreshButton.className = 'button primary-button mt-10';
      refreshButton.style.marginTop = '10px';
      refreshButton.style.display = 'block';
      refreshButton.onclick = () => {
        window.location.href = window.location.pathname + '?force_refresh=true';
      };
      
      // 插入按钮
      const aiContainer = document.querySelector('.ai-container');
      if (aiContainer) {
        aiContainer.appendChild(refreshButton);
      }
      
      // 10秒后自动刷新
      setTimeout(() => {
        if (!document.hidden) { // 仅当页面可见时自动刷新
          window.location.href = window.location.pathname + '?force_refresh=true';
        }
      }, 10000);
    }
  } catch (error) {
    console.error('检查AI状态时出错:', error);
  }
  
  // 继续初始化其他功能
  initializeApplication();
});

/**
 * 检查API服务器状态
 * @returns {Promise<boolean>} API是否可用
 */
function checkApiStatus() {
  console.log('正在检查API服务器状态...');
  
  return fetch('/api/status')
    .then(response => {
      if (!response.ok) {
        throw new Error(`API状态检查失败: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('API状态检查结果:', data);
      
      if (data && data.success) {
        app.connectionStatus = 'connected';
        
        // 更新环境相关的状态
        if (data.environments) {
          app.environmentCounts.apiAvailable = data.environments.apiAvailable;
          
          if (data.environments.count !== undefined) {
            app.environmentCounts.expected = data.environments.count;
          }
        }
        
        return true;
      } else {
        app.connectionStatus = 'error';
        return false;
      }
    })
    .catch(error => {
      console.error('API状态检查错误:', error);
      app.connectionStatus = 'error';
      return false;
    });
}

/**
 * 初始化应用程序
 */
function initializeApplication() {
  console.log('正在初始化应用组件...');
  
  try {
    // 从localStorage读取上次选择的环境ID
    const savedEnvId = localStorage.getItem('selectedEnvId');
    if (savedEnvId) {
      app.selectedEnvId = savedEnvId;
      console.log(`从本地存储恢复选中的环境ID: ${savedEnvId}`);
    }
    
    // 先检查API状态
    checkApiStatus()
      .then(apiAvailable => {
        console.log(`API状态检查结果: ${apiAvailable ? '可用' : '不可用'}`);
        
        // 无论API是否可用，都继续初始化其他组件
        // 初始化环境列表
        initializeEnvironmentList();
        
        // 设置刷新环境按钮
        setupRefreshButton();
        
        // 设置环境过滤
        setupFilterInput();
        
        // 设置懒加载
        setupLazyLoading();
        
        // 设置键盘快捷键
        setupKeyboardShortcuts();
        
        // 设置事件监听
        setupEventListeners();
        
        // 确保AI客户端已加载
        if (window.aiClient) {
          console.log('AI客户端已加载，初始化中...');
          
          // 确保AI客户端了解选中的环境ID
          if (app.selectedEnvId) {
            window.aiClient.selectedEnvId = app.selectedEnvId;
            console.log(`将选中的环境ID: ${app.selectedEnvId} 同步到AI客户端`);
          }
          
          // 3秒后更新AI状态为就绪
          setTimeout(() => {
            console.log('更新AI状态为就绪');
            updateAIStatus('ready');
          }, 3000);
        } else {
          console.warn('AI客户端未加载，尝试创建新实例');
          // 尝试创建一个新的AiClient实例
          if (typeof AiClient === 'function') {
            window.aiClient = new AiClient();
            console.log('已创建新的AI客户端实例');
          } else {
            console.error('无法创建AI客户端，AiClient类不可用');
          }
        }
        
        console.log('应用初始化完成');
      })
      .catch(error => {
        console.error('API状态检查失败:', error);
        // 即使API检查失败，也继续初始化UI
        initializeEnvironmentList();
        setupRefreshButton();
        setupFilterInput();
        setupLazyLoading();
        setupKeyboardShortcuts();
        setupEventListeners();
        
        console.log('应用初始化完成（API检查失败）');
      });
  } catch (error) {
    console.error('应用初始化失败:', error);
    // 显示错误消息
    updateUIState('error', `初始化应用失败: ${error.message}`);
  }
}

/**
 * 初始化UI元素
 */
function initUI() {
  console.log('初始化UI元素...');
  
  try {
    // 安全地初始化Bootstrap弹窗
    const startEnvModal = document.getElementById('startEnvModal');
    if (startEnvModal) {
      app.modals.startEnv = new bootstrap.Modal(startEnvModal);
    } else {
      console.log('startEnvModal元素不存在，跳过初始化');
    }
    
    // 设置环境列表状态
    updateUIState('loading', '正在加载环境列表...');
    
    console.log('UI元素初始化完成');
  } catch (error) {
    console.error('初始化UI元素时出错:', error);
  }
}

/**
 * 设置事件监听器
 */
function setupEventListeners() {
  console.log('开始设置事件监听器...');
  
  try {
    // 刷新环境列表按钮
    const refreshBtn = document.getElementById('refresh-environments');
    if (refreshBtn) {
      console.log('找到刷新按钮，添加事件监听器');
      refreshBtn.addEventListener('click', () => {
        // 获取当前选择的分组ID
        const groupSelector = document.getElementById('group-selector');
        const groupId = groupSelector ? groupSelector.value : '';
        console.log(`点击刷新按钮，当前选择的分组ID: ${groupId || '全部'}`);
        fetchEnvironmentList(groupId);
      });
    } else {
      console.warn('未找到refresh-environments按钮');
    }
    
    // 分组选择器变更事件
    const groupSelector = document.getElementById('group-selector');
    if (groupSelector) {
      console.log('找到分组选择器，添加change事件监听器');
      groupSelector.addEventListener('change', (e) => {
        const groupId = e.target.value;
        console.log(`分组选择变更为: ${groupId || '全部'}`);
        fetchEnvironmentList(groupId);
      });
    } else {
      console.warn('未找到group-selector下拉框');
    }
    
    // AI指令按钮
    const commandBtn = document.getElementById('command-btn');
    if (commandBtn) {
      console.log('找到命令按钮，添加事件监听器');
      commandBtn.addEventListener('click', handleCommandExecution);
    } else {
      console.warn('未找到command-btn按钮');
    }
    
    // 键盘事件: 回车键执行指令
    const inputField = document.getElementById('ai-command-input');
    if (inputField) {
      console.log('找到命令输入框，添加键盘事件监听器');
      inputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          handleCommandExecution();
        }
      });
    } else {
      console.warn('未找到ai-command-input输入框');
    }
    
    console.log('事件监听器设置完成');
  } catch (error) {
    console.error('设置事件监听器时出错:', error);
  }
}

/**
 * 设置WebSocket连接
 */
function setupWebSocket() {
  console.log('设置WebSocket连接...');
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  
  app.socket = new WebSocket(wsUrl);
  
  app.socket.onopen = () => {
    console.log('WebSocket已连接');
    updateAIStatus('ready');
  };
  
  app.socket.onclose = () => {
    console.log('WebSocket已断开');
    updateAIStatus('error', '连接已断开，请刷新页面');
    
    // 尝试重新连接
    setTimeout(setupWebSocket, 5000);
  };
  
  app.socket.onerror = (error) => {
    console.error('WebSocket错误:', error);
    updateAIStatus('error', '连接出错');
  };
  
  app.socket.onmessage = (event) => {
    handleWebSocketMessage(event);
  };
}

/**
 * 处理WebSocket消息
 * @param {MessageEvent} event WebSocket消息事件
 */
function handleWebSocketMessage(event) {
  try {
    const message = JSON.parse(event.data);
    
    switch (message.type) {
      case 'environment_update':
        handleEnvironmentUpdate(message.data);
        break;
        
      case 'task_update':
        handleTaskUpdate(message.data);
        break;
        
      case 'command_result':
        handleCommandResult(message.data);
        break;
        
      case 'error':
        handleErrorMessage(message.data);
        break;
        
      default:
        console.log('未知的WebSocket消息类型:', message.type);
    }
  } catch (error) {
    console.error('处理WebSocket消息时出错:', error);
  }
}

/**
 * 获取环境列表
 */
function fetchEnvironmentList(groupId = '') {
  console.log('开始获取环境列表，分组:', groupId || '全部');
  
  const envListContainer = document.getElementById('env-list');
  if (!envListContainer) return;
  
  // 显示加载状态
  envListContainer.innerHTML = '<div class="loading-indicator"><p>正在加载环境列表...</p></div>';
  
  // 构建API URL
  let apiUrl = '/api/environments';
  if (groupId && groupId !== 'all') {
    apiUrl += `?group_id=${encodeURIComponent(groupId)}`;
  }
  
  // 发起API请求
  fetch(apiUrl)
    .then(response => {
      if (!response.ok) {
        throw new Error(`服务器返回错误: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('环境列表API响应:', data);
      
      let environments = [];
      let totalCount = 0;
      let runningCount = 0;
      
      // 处理不同的响应格式
      if (data && data.success && 'environments' in data) {
        // 新格式 - environments 属性存在(即使是空数组)
        environments = data.environments || [];
        totalCount = data.total_count || 0;
        runningCount = data.running_count || 0;
        console.log(`环境列表(新格式): 总计${totalCount}个, 运行中${runningCount}个`);
      } else if (data && Array.isArray(data)) {
        // 旧格式 - 直接数组
        environments = data;
        totalCount = data.length;
      } else if (data && data.data && Array.isArray(data.data)) {
        // 旧格式 - 嵌套在data属性中
        environments = data.data;
        totalCount = data.data.length;
      } else if (data && data.data && data.data.list && Array.isArray(data.data.list)) {
        // 原始AdsPower API格式
        environments = data.data.list;
        totalCount = data.data.list.length;
      } else {
        console.warn('无法识别的环境列表数据格式:', data);
        // 尝试以最宽松的方式解析，而不是直接抛出错误
        environments = [];
      }
      
      // 不再因为空数组抛出错误
      if (!Array.isArray(environments)) {
        console.error('环境列表数据格式错误:', data);
        throw new Error('环境列表数据格式错误');
      }
      
      // 空列表是正常情况，只要格式正确就继续处理
      console.log(`成功获取 ${environments.length} 个环境`);
      app.environments = environments;  // 保存到全局状态
      
      // 更新全局计数
      app.environmentCounts = {
        total: totalCount,
        running: runningCount
      };
      
      renderEnvironmentList(environments);
    })
    .catch(error => {
      console.error('获取环境列表失败:', error);
      envListContainer.innerHTML = `
        <div class="error-message">
          <p>获取环境列表失败</p>
          <p class="error-details">${error.message}</p>
          <button onclick="fetchEnvironmentList()" class="retry-button">重试</button>
        </div>
      `;
    });
}

/**
 * 设置刷新按钮
 */
function setupRefreshButton() {
  console.log('设置刷新按钮...');
  
  const refreshBtn = document.getElementById('refresh-environments');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function() {
      console.log('刷新按钮被点击');
      
      // 获取当前选择的分组ID
      const groupSelector = document.getElementById('group-selector');
      const selectedGroup = groupSelector ? groupSelector.value : '';
      
      // 刷新环境列表
      fetchEnvironmentList(selectedGroup);
    });
    console.log('刷新按钮设置完成');
  } else {
    console.warn('未找到刷新按钮元素');
  }
}

/**
 * 设置环境过滤输入框
 */
function setupFilterInput() {
  console.log('设置环境过滤输入框...');
  
  const filterInput = document.querySelector('input[placeholder="搜索环境..."]');
  if (filterInput) {
    filterInput.addEventListener('input', function() {
      const searchTerm = this.value.toLowerCase().trim();
      filterEnvironments(searchTerm);
    });
    console.log('环境过滤输入框设置完成');
  } else {
    console.warn('未找到环境搜索输入框');
  }
}

/**
 * 过滤环境列表
 * @param {string} searchTerm 搜索关键词
 */
function filterEnvironments(searchTerm) {
  const envItems = document.querySelectorAll('.env-item');
  
  envItems.forEach(item => {
    const name = item.querySelector('.env-name').textContent.toLowerCase();
    const id = item.getAttribute('data-id').toLowerCase();
    
    // 如果环境名称或ID包含搜索词，显示该环境，否则隐藏
    if (name.includes(searchTerm) || id.includes(searchTerm)) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  });
}

/**
 * 设置键盘快捷键
 */
function setupKeyboardShortcuts() {
  console.log('设置键盘快捷键...');
  
  // 添加全局键盘事件监听
  document.addEventListener('keydown', function(e) {
    // Ctrl+R 或 Command+R 刷新环境列表
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
      // 阻止浏览器刷新
      e.preventDefault();
      
      // 模拟点击刷新按钮
      const refreshBtn = document.getElementById('refresh-environments');
      if (refreshBtn) {
        refreshBtn.click();
      }
    }
  });
  
  console.log('键盘快捷键设置完成');
}

/**
 * 渲染环境列表到页面
 * @param {Array|Object} environments - 环境列表数据或包含环境列表的对象
 */
function renderEnvironmentList(environments) {
  console.log(`渲染环境列表，共 ${environments.length} 个环境`);
  
  // 获取环境列表容器
  const envListEl = document.getElementById('env-list');
  if (!envListEl) {
    console.error('找不到环境列表容器元素');
    return;
  }
  
  // 清空现有内容
  envListEl.innerHTML = '';
  
  // 如果没有环境，显示提示信息
  if (environments.length === 0) {
    envListEl.innerHTML = `
      <div class="empty-state">
        <p>没有找到环境</p>
        <p class="empty-state-sub">请确认AdsPower已启动并且API已启用</p>
        <button id="retry-load" class="button primary-button">重试</button>
      </div>
    `;
    
    // 添加重试按钮事件
    const retryBtn = document.getElementById('retry-load');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        fetchEnvironmentList();
      });
    }
    
    return;
  }
  
  // 直接生成环境列表HTML
  let listHTML = '';
  environments.forEach(env => {
    // 确保env对象有必要的属性
    const envId = env.user_id || env.id || '';
    const envName = env.name || env.serial_number || '未命名环境';
    const isRunning = env.is_running === true || 
                     (env.status && ['Active', 'Running'].includes(env.status));
    
    const statusClass = isRunning ? 'status-running' : 'status-stopped';
    const statusText = isRunning ? '运行中' : '已停止';
    
    listHTML += `
      <div class="env-item" data-id="${envId}">
        <div class="env-name">${envName}</div>
        <div class="env-status ${statusClass}">${statusText}</div>
        <div class="env-actions">
          <button class="btn-action btn-start" data-id="${envId}" title="启动环境" ${isRunning ? 'disabled' : ''}>
            <i class="fas fa-play"></i>
          </button>
          <button class="btn-action btn-stop" data-id="${envId}" title="停止环境" ${!isRunning ? 'disabled' : ''}>
            <i class="fas fa-stop"></i>
          </button>
          <button class="btn-action btn-inspect" data-id="${envId}" title="元素检查器" ${!isRunning ? 'disabled' : ''}>
            <i class="fas fa-search"></i>
          </button>
          <button class="btn-action btn-info" data-id="${envId}" title="环境详情">
            <i class="fas fa-info-circle"></i>
          </button>
        </div>
      </div>
    `;
  });
  
  envListEl.innerHTML = listHTML;
  
  // 添加环境操作按钮事件
  setupEnvironmentActions();
  
  // 触发环境列表更新事件，通知AI客户端
  console.log('触发environmentListUpdated事件，通知AI客户端刷新环境列表');
  document.dispatchEvent(new CustomEvent('environmentListUpdated', {
    detail: { environments: environments }
  }));
  
  // 直接更新AI客户端的环境列表（如果可用）
  if (window.aiClient) {
    console.log('直接更新AI客户端环境列表');
    window.aiClient.environments = environments;
    window.aiClient.updateEnvironmentSelector();
  } else {
    console.warn('无法更新AI客户端环境列表：AI客户端未找到');
  }
}

/**
 * 设置环境操作按钮的事件处理
 */
function setupEnvironmentActions() {
  // 获取所有启动按钮
  const startButtons = document.querySelectorAll('.btn-start');
  startButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      e.stopPropagation(); // 阻止事件冒泡
      const envId = this.getAttribute('data-id');
      startEnvironment(envId);
    });
  });
  
  // 获取所有停止按钮
  const stopButtons = document.querySelectorAll('.btn-stop');
  stopButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      e.stopPropagation(); // 阻止事件冒泡
      const envId = this.getAttribute('data-id');
      stopEnvironment(envId);
    });
  });
  
  // 获取所有信息按钮
  const infoButtons = document.querySelectorAll('.btn-info');
  infoButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      e.stopPropagation(); // 阻止事件冒泡
      e.preventDefault(); // 阻止默认行为
      const envId = this.getAttribute('data-id');
      showEnvironmentDetails(envId);
    });
  });
  
  // 获取所有元素检查器按钮
  const inspectButtons = document.querySelectorAll('.btn-inspect');
  inspectButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      e.stopPropagation(); // 阻止事件冒泡
      e.preventDefault(); // 阻止默认行为
      const envId = this.getAttribute('data-id');
      openElementInspector(envId);
    });
  });
  
  // 为环境项添加点击事件，选择为AI命令执行环境
  const envItems = document.querySelectorAll('.env-item');
  envItems.forEach(item => {
    item.addEventListener('click', function(e) {
      // 只有点击环境项本身（不是按钮）时才选择环境
      if (e.target.closest('.btn-action') || e.target.closest('.btn-info')) {
        return;
      }
      
      const envId = this.getAttribute('data-id');
      selectEnvironmentForAI(envId);
    });
  });
}

/**
 * 选择环境作为AI命令执行目标
 * @param {string} envId - 环境ID
 */
function selectEnvironmentForAI(envId) {
  // 清除之前选中的环境
  const prevSelected = document.querySelector('.env-item.ai-selected');
  if (prevSelected) {
    prevSelected.classList.remove('ai-selected');
  }
  
  // 选中新环境
  const envItem = document.querySelector(`.env-item[data-id="${envId}"]`);
  if (envItem) {
    envItem.classList.add('ai-selected');
    app.selectedEnvId = envId;
    
    // 如果AI客户端存在，也更新其选择
    if (window.aiClient && window.aiClient.envSelector) {
      window.aiClient.envSelector.value = envId;
      window.aiClient.selectedEnvId = envId;
    }
    
    // 显示通知
    const envName = envItem.querySelector('.env-name')?.textContent || envId;
    displayNotification(`已选择环境: ${envName}`, 'success');
    console.log(`已选择环境: ${envId} 作为AI命令执行目标`);
    
    // 将当前选择的环境ID保存到本地存储，以便刷新后保留选择
    localStorage.setItem('selectedEnvId', envId);
  }
}

/**
 * 检查环境是否处于运行状态
 * @param {any} isRunningValue - is_running字段的值，可能是布尔值或对象
 * @returns {boolean} 是否运行中
 */
function isEnvironmentRunning(isRunningValue) {
  // 如果是布尔值，直接返回
  if (isRunningValue === true || isRunningValue === false) {
    return isRunningValue;
  }
  
  // 如果是对象且有connected属性，使用connected属性判断
  if (isRunningValue && typeof isRunningValue === 'object') {
    if (isRunningValue.connected === true) {
      return true;
    }
    
    // 如果有status属性且值为connected或running，认为是运行中
    if (isRunningValue.status === 'connected' || isRunningValue.status === 'running') {
      return true;
    }
  }
  
  // 对于其他情况，如果是非空对象也视为运行中
  return !!(isRunningValue && typeof isRunningValue === 'object' && Object.keys(isRunningValue).length > 0);
}

/**
 * 格式化时间戳为友好格式
 */
function formatTime(timestamp) {
  if (!timestamp) return '无记录';
  
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}天前`;
  
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * 获取状态对应的CSS类名
 * @param {string} status 状态文本
 * @returns {string} CSS类名
 */
function getStatusClass(status) {
  switch (status) {
    case 'running':
      return 'status-running';
    case 'stopped':
      return 'status-stopped';
    case 'error':
      return 'status-error';
    default:
      return 'status-stopped';
  }
}

/**
 * 启动指定的环境
 * @param {string} envId - 环境ID
 */
function startEnvironment(envId) {
  if (!envId) {
    console.error('启动环境失败：未提供环境ID');
    return;
  }
  
  console.log(`准备启动环境: ${envId}`);
  // 更新按钮状态为加载中
  const btn = document.querySelector(`.btn-start[data-id="${envId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  }
  
  // 修复API路径 - 使用environments复数形式
  fetch(`/api/environments/${envId}/start`, {
    method: 'POST'
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`服务器返回错误: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    console.log(`环境启动请求结果:`, data);
    if (data.success) {
      // 使用新的函数更新环境状态
      updateEnvironmentStatus(envId, true);
      
      // 显示成功消息
      displayNotification('环境启动成功', 'success');
    } else {
      console.error(`启动环境失败:`, data.error || data.message);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-play"></i>';
      }
      
      // 显示错误消息
      alert(`启动环境失败: ${data.error || data.message || '未知错误'}`);
    }
  })
  .catch(error => {
    console.error(`启动环境API请求失败:`, error);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-play"></i>';
    }
    
    // 显示错误消息
    alert(`启动环境失败: ${error.message}`);
  });
}

/**
 * 停止指定环境
 * @param {string} envId - 环境ID
 */
function stopEnvironment(envId) {
  if (!envId) {
    console.error('停止环境失败：未提供环境ID');
    return;
  }
  
  console.log(`准备停止环境: ${envId}`);
  // 更新按钮状态为加载中
  const btn = document.querySelector(`.btn-stop[data-id="${envId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  }
  
  // 修复API路径 - 使用environments复数形式
  fetch(`/api/environments/${envId}/stop`, {
    method: 'POST'
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`服务器返回错误: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    console.log(`环境停止请求结果:`, data);
    if (data.success) {
      // 使用新的函数更新环境状态
      updateEnvironmentStatus(envId, false);
      
      // 显示成功消息
      displayNotification('环境已停止', 'info');
    } else {
      console.error(`停止环境失败:`, data.error || data.message);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-stop"></i>';
      }
      
      // 显示错误消息
      alert(`停止环境失败: ${data.error || data.message || '未知错误'}`);
    }
  })
  .catch(error => {
    console.error(`停止环境API请求失败:`, error);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-stop"></i>';
    }
    
    // 显示错误消息
    alert(`停止环境失败: ${error.message}`);
  });
}

/**
 * 显示环境详细信息
 * @param {string} envId - 环境ID
 */
function showEnvironmentDetails(envId) {
  if (!envId) {
    console.error('显示环境详情失败：未提供环境ID');
    return;
  }
  
  console.log(`显示环境详情: ${envId}`);
  
  // 修复API路径 - 使用environments复数形式
  fetch(`/api/environments/${envId}`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`服务器返回错误: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.success) {
        // 创建详情弹窗
        const modal = document.createElement('div');
        modal.className = 'env-details-modal';
        modal.innerHTML = `
          <div class="modal-content">
            <div class="modal-header">
              <h3>环境详情</h3>
              <button class="close-btn">&times;</button>
            </div>
            <div class="modal-body">
              <div class="detail-item">
                <span class="label">环境ID:</span>
                <span class="value">${data.environment.user_id || data.environment.id}</span>
              </div>
              <div class="detail-item">
                <span class="label">名称:</span>
                <span class="value">${data.environment.name || '未命名'}</span>
              </div>
              <div class="detail-item">
                <span class="label">状态:</span>
                <span class="value">${data.environment.is_running ? '运行中' : '已停止'}</span>
              </div>
              <div class="detail-item">
                <span class="label">分组:</span>
                <span class="value">${data.environment.group_name || '未分组'}</span>
              </div>
              <div class="detail-item">
                <span class="label">创建时间:</span>
                <span class="value">${formatDate(data.environment.created_time)}</span>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn-primary">确定</button>
              ${data.environment.is_running ? 
                `<button class="btn-secondary btn-open-inspector" data-id="${envId}">打开元素检查器</button>` : 
                '<button class="btn-secondary" disabled>需要启动环境才能打开检查器</button>'}
            </div>
          </div>
        `;
        
        // 添加到文档
        document.body.appendChild(modal);
        
        // 添加关闭事件
        const closeBtn = modal.querySelector('.close-btn');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            modal.remove();
          });
        }
        
        // 确定按钮关闭弹窗
        const confirmBtn = modal.querySelector('.btn-primary');
        if (confirmBtn) {
          confirmBtn.addEventListener('click', () => {
            modal.remove();
          });
        }
        
        // 添加打开元素检查器按钮事件
        const inspectorBtn = modal.querySelector('.btn-open-inspector');
        if (inspectorBtn) {
          inspectorBtn.addEventListener('click', () => {
            openElementInspector(inspectorBtn.getAttribute('data-id'));
            modal.remove();
          });
        }
      } else {
        console.error('获取环境详情失败:', data.error || data.message);
        alert(`获取环境详情失败: ${data.error || data.message || '未知错误'}`);
      }
    })
    .catch(error => {
      console.error('获取环境详情API请求失败:', error);
      alert(`获取环境详情失败: ${error.message}`);
    });
}

/**
 * 打开元素检查器
 * @param {string} envId - 要打开元素检查器的环境ID
 */
function openElementInspector(envId) {
  if (!envId) {
    console.error('无法打开元素检查器: 未提供环境ID');
    return;
  }
  
  console.log(`正在打开环境 ${envId} 的元素检查器...`);
  
  // 先检查环境状态
  fetch(`/api/environments/${envId}`)
    .then(response => response.json())
    .then(data => {
      if (!data.success || !data.environment) {
        throw new Error('无法获取环境信息');
      }
      
      if (!data.environment.is_running) {
        displayNotification('请先启动环境然后再打开元素检查器', 'warning');
        return;
      }
      
      // 环境已运行，打开元素检查器
      window.open(`/element-explorer/${envId}`, '_blank');
      displayNotification('元素检查器已在新标签页中打开', 'info');
    })
    .catch(error => {
      console.error('打开元素检查器失败:', error);
      displayNotification(`打开元素检查器失败: ${error.message}`, 'error');
    });
}

/**
 * 格式化日期时间
 * @param {number|string} timestamp - 时间戳
 * @returns {string} 格式化的日期时间
 */
function formatDate(timestamp) {
  if (!timestamp) return '未知';
  
  // 转换为数字
  const ts = parseInt(timestamp);
  
  // 检查时间戳格式（秒/毫秒）
  const date = new Date(ts * 1000);
  
  // 检查是否有效日期
  if (isNaN(date.getTime())) {
    return '无效日期';
  }
  
  return date.toLocaleString();
}

/**
 * 处理环境更新消息
 * @param {Object} data 环境更新数据
 */
function handleEnvironmentUpdate(data) {
  console.log('收到环境更新:', data);
  
  if (data.id) {
    // 查找是否已有此环境
    const existingIndex = app.environments.findIndex(e => e.id === data.id);
    
    if (existingIndex >= 0) {
      // 更新现有环境
      app.environments[existingIndex] = { ...app.environments[existingIndex], ...data };
      
      // 更新UI
      updateEnvironmentStatus(data.id, data.status);
      if (data.notes !== undefined) {
        updateEnvironmentNote(data.id, data.notes);
      }
    } else {
      // 添加新环境
      app.environments.push(data);
      renderEnvironmentList();
    }
  }
}

/**
 * 处理任务更新消息
 * @param {Object} data 任务更新数据
 */
function handleTaskUpdate(data) {
  console.log('收到任务更新:', data);
  
  // 如果有环境ID，更新相应环境的状态
  if (data.environmentId) {
    const env = app.environments.find(e => e.id === data.environmentId);
    if (env) {
      env.currentTask = data;
    }
  }
  
  // 如果是选中的环境，更新任务详情UI
  if (app.selectedEnvId && app.selectedEnvId === data.environmentId) {
    updateTaskDetailsUI(data);
  }
}

/**
 * 处理命令执行结果
 * @param {Object} data 命令结果数据
 */
function handleCommandResult(data) {
  try {
    console.log('收到命令结果:', data);
    
    // 使用logs-container作为结果容器
    const resultContainer = document.getElementById('logs-container');
    
    // 检查容器是否存在
    if (!resultContainer) {
      console.error('找不到日志容器元素，ID: logs-container');
      displayNotification('无法显示命令结果，找不到日志容器', 'error');
      return;
    }
    
    // 创建结果元素
    const resultElement = document.createElement('div');
    resultElement.className = `alert ${data.success ? 'alert-success' : 'alert-danger'} mt-2`;
    
    // 设置结果内容
    resultElement.innerHTML = `
      <div class="d-flex justify-content-between align-items-top">
        <div>${data.message || '命令已执行'}</div>
        <button type="button" class="btn-close" aria-label="关闭"></button>
      </div>
    `;
    
    // 添加关闭按钮事件
    const closeButton = resultElement.querySelector('.btn-close');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        resultElement.remove();
      });
    }
    
    // 添加到结果容器
    resultContainer.appendChild(resultElement);
    
    // 自动滚动到底部
    resultContainer.scrollTop = resultContainer.scrollHeight;
    
    // 更新AI状态
    updateAIStatus('ready');
    
    // 清空输入框
    if (data.success) {
      const commandInput = document.getElementById('ai-command-input');
      if (commandInput) {
        commandInput.value = '';
      } else {
        console.error('找不到AI命令输入框，ID: ai-command-input');
      }
    }
  } catch (error) {
    console.error('处理命令结果时出错:', error);
    displayNotification(`处理命令结果失败: ${error.message}`, 'error');
    updateAIStatus('error', '处理结果出错');
  }
}

/**
 * 处理错误消息
 * @param {Object} data 错误数据
 */
function handleErrorMessage(data) {
  console.error('收到错误消息:', data);
  
  if (data.type === 'command_error') {
    // 处理命令错误
    handleCommandResult({
      success: false,
      message: data.message || '命令执行失败'
    });
  } else {
    // 处理其他错误
    alert(data.message || '发生错误');
  }
  
  // 更新AI状态
  updateAIStatus('error', data.message);
}

/**
 * 更新AI状态
 * @param {string} status 状态 (ready, processing, error)
 * @param {string} message 可选的状态消息
 */
function updateAIStatus(status, message) {
  app.aiStatus = status;
  
  const aiStatusElement = document.getElementById('ai-status');
  const commandBtn = document.getElementById('command-btn');
  const commandInput = document.getElementById('ai-command-input');
  
  if (!aiStatusElement) {
    console.error('找不到AI状态元素(#ai-status)');
    return;
  }
  
  // 找到或创建状态指示器和文本元素
  let statusIndicator = aiStatusElement.querySelector('.status-indicator');
  let statusText = aiStatusElement.querySelector('.status-text');
  
  if (!statusIndicator) {
    statusIndicator = document.createElement('span');
    statusIndicator.className = 'status-indicator';
    aiStatusElement.appendChild(statusIndicator);
  }
  
  if (!statusText) {
    statusText = document.createElement('span');
    statusText.className = 'status-text ms-2';
    aiStatusElement.appendChild(statusText);
  }
  
  // 更新状态文本和样式
  switch (status) {
    case 'ready':
      statusText.textContent = '就绪';
      aiStatusElement.className = 'alert alert-success d-flex align-items-center mb-3';
      statusIndicator.className = 'status-indicator ready';
      if (commandBtn) commandBtn.disabled = false;
      if (commandInput) commandInput.disabled = false;
      break;
      
    case 'processing':
      statusText.textContent = '处理中...';
      aiStatusElement.className = 'alert alert-warning d-flex align-items-center mb-3';
      statusIndicator.className = 'status-indicator loading';
      if (commandBtn) commandBtn.disabled = true;
      if (commandInput) commandInput.disabled = true;
      break;
      
    case 'error':
      statusText.textContent = message || '错误';
      aiStatusElement.className = 'alert alert-danger d-flex align-items-center mb-3';
      statusIndicator.className = 'status-indicator error';
      if (commandBtn) commandBtn.disabled = false;
      if (commandInput) commandInput.disabled = false;
      break;
  }
}

/**
 * 处理命令执行
 */
async function handleCommandExecution() {
  try {
    // 使用正确的选择器 - ai-command-input而不是command-input
    const commandInput = document.getElementById('ai-command-input');
    
    // 检查元素是否存在
    if (!commandInput) {
      console.error('找不到AI命令输入框，ID: ai-command-input');
      displayNotification('无法找到命令输入框', 'error');
      return;
    }
    
    const command = commandInput.value.trim();
    
    if (!command) {
      displayNotification('请输入命令', 'warning');
      return;
    }
    
    console.log(`执行命令: ${command}`);
    updateAIStatus('processing');
    
    // 获取选中的环境ID (如果有)
    const selectedEnvId = app.selectedEnvId || '';
    console.log(`使用环境ID: ${selectedEnvId || '无'}`);
    
    // 获取选中的AI模型
    const modelSelector = document.getElementById('ai-model-selector');
    const modelId = modelSelector ? modelSelector.value : 'openai';
    
    // 查找日志容器
    const logsContainer = document.getElementById('logs-container');
    if (!logsContainer) {
      console.error('找不到日志容器，ID: logs-container');
      displayNotification('无法显示命令执行状态，找不到日志容器', 'error');
      // 即使没有日志容器也继续执行，只是不显示临时元素
    }
    
    // 创建临时结果提示
    let tempElement = null;
    
    if (logsContainer) {
      // 创建临时提示元素
      tempElement = document.createElement('div');
      tempElement.className = 'alert alert-info mt-2';
      tempElement.innerHTML = `<div><i class="fas fa-spinner fa-spin me-2"></i>正在处理: ${command}</div>`;
      logsContainer.appendChild(tempElement);
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }
    
    try {
      // 发送命令执行请求
      const response = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          command,
          envId: selectedEnvId,
          modelId
        })
      });
      
      // 检查响应状态
      if (!response.ok) {
        throw new Error(`执行命令失败: ${response.status} ${response.statusText}`);
      }
      
      // 获取响应数据
      const responseData = await response.json();
      console.log('命令执行响应:', responseData);
      
      // 移除临时提示
      if (tempElement && tempElement.parentNode) {
        tempElement.remove();
      }
      
      // 处理响应结果
      handleCommandResult({
        success: responseData.success === true,
        message: responseData.message || '命令已执行'
      });
      
    } catch (fetchError) {
      console.error('命令执行请求失败:', fetchError);
      
      // 移除临时提示
      if (tempElement && tempElement.parentNode) {
        tempElement.remove();
      }
      
      // 处理错误
      handleCommandResult({
        success: false,
        message: `执行失败: ${fetchError.message}`
      });
      
      updateAIStatus('error', fetchError.message);
    }
    
  } catch (error) {
    console.error('命令执行处理失败:', error);
    
    // 处理整体异常
    handleCommandResult({
      success: false,
      message: `执行错误: ${error.message}`
    });
    
    updateAIStatus('error', error.message);
  }
}

/**
 * 更新UI状态
 * @param {string} state 状态: 'loading', 'loaded', 'error'
 * @param {string} message 状态消息
 */
function updateUIState(state, message) {
  console.log(`UI状态更新: ${state}${message ? ' - ' + message : ''}`);
  
  // 更新状态指示器
  const statusContainer = document.getElementById('ai-status-container');
  if (statusContainer) {
    let statusHTML = '<span>状态: </span>';
    
    if (state === 'loading') {
      statusHTML += '<span class="status-badge loading">加载中...</span>';
    } else if (state === 'error') {
      statusHTML += '<span class="status-badge error">错误</span>';
    } else if (state === 'processing') {
      statusHTML += '<span class="status-badge processing">处理中...</span>';
    } else {
      statusHTML += '<span class="status-badge ready">就绪</span>';
    }
    
    statusContainer.innerHTML = statusHTML;
  }
  
  // 更新AI状态元素
  if (state === 'loaded') {
    updateAIStatus('ready');
  } else if (state === 'error') {
    updateAIStatus('error', message);
  } else if (state === 'loading') {
    updateAIStatus('processing', '正在加载...');
  }
  
  // 显示消息通知
  if (message) {
    displayNotification(message, state === 'error' ? 'error' : (state === 'loaded' ? 'success' : 'info'));
  }
  
  // 更新全局状态
  app.uiState = state;
}

/**
 * 显示通知
 * @param {string} message 通知消息
 * @param {string} type 通知类型: 'success', 'error', 'info', 'warning'
 * @param {number} duration 显示时长(毫秒)
 */
function displayNotification(message, type = 'info', duration = 5000) {
  console.log(`显示通知: ${type} - ${message}`);
  
  // 获取或创建通知容器
  let container = document.getElementById('notification-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notification-container';
    document.body.appendChild(container);
  }
  
  // 创建通知元素
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerHTML = message;
  
  // 添加到容器并设置自动消失
  container.appendChild(notification);
  
  // 动画效果：淡入
  setTimeout(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateX(0)';
  }, 10);
  
  // 设置自动消失
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    
    // 移除DOM元素
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, duration);
}

function showMessage(type, message, duration = 5000) {
  const messageElement = document.getElementById('message');
  messageElement.textContent = message;
  messageElement.className = `message ${type}`;
  messageElement.style.display = 'block';
  
  // 自动隐藏消息
  clearTimeout(messageTimeout);
  messageTimeout = setTimeout(() => {
    messageElement.style.display = 'none';
  }, duration);
}

/**
 * 显示加载状态
 */
function showLoading() {
  const loadingEl = document.getElementById('loading');
  if (loadingEl) {
    loadingEl.style.display = 'flex';
  }
}

/**
 * 隐藏加载状态
 */
function hideLoading() {
  const loadingEl = document.getElementById('loading');
  if (loadingEl) {
    loadingEl.style.display = 'none';
  }
}

/**
 * 监控环境数量变化
 */
function monitorEnvironmentCount() {
  let lastCount = 0;
  
  // 每10秒检查一次环境数量
  setInterval(() => {
    const currentCount = app.environments.length;
    
    if (lastCount > 0 && currentCount !== lastCount) {
      console.log(`环境数量变化: ${lastCount} -> ${currentCount}`);
      displayNotification(`环境数量已更新: ${currentCount} 个环境`, 'info');
    }
    
    lastCount = currentCount;
  }, 10000);
}

// 清理浏览器缓存 - 用于解决AI连接问题
function clearBrowserCache() {
  // 添加时间戳参数强制刷新
  const cacheBuster = Date.now();
  const refreshButton = document.getElementById('refresh-environments');
  
  if (refreshButton) {
    refreshButton.addEventListener('click', function(e) {
      // 强制清除缓存并刷新页面
      e.preventDefault();
      
      // 尝试重新加载AI模型
      if (window.aiClient) {
        window.aiClient.loadModels();
      }
      
      // 显示通知
      showNotification('正在重新连接AI服务...', 'info');
    });
  }

  // 在页面加载完成10秒后尝试重新连接AI
  setTimeout(() => {
    if (window.aiClient && window.aiClient.status === 'error') {
      console.log('检测到AI连接错误，自动尝试重新连接...');
      window.aiClient.loadModels();
    }
  }, 10000);
}

/**
 * 设置懒加载功能，优化长列表性能
 */
function setupLazyLoading() {
  console.log('设置懒加载功能...');
  
  // 获取环境列表容器
  const envList = document.getElementById('env-list');
  if (!envList) {
    console.warn('找不到环境列表容器，无法设置懒加载');
    return;
  }
  
  // 添加滚动事件监听
  envList.addEventListener('scroll', function() {
    // 检查是否滚动到底部附近
    const scrollDistance = this.scrollHeight - this.scrollTop - this.clientHeight;
    if (scrollDistance < 200) {
      console.log('滚动接近底部，可以加载更多项目');
      // 这里可以添加加载更多内容的逻辑
    }
  });
  
  console.log('懒加载设置完成');
}

/**
 * 初始化环境列表
 * 从服务器获取环境数据并渲染到页面
 */
function initializeEnvironmentList() {
  console.log('正在初始化环境列表...');
  
  // 获取环境列表容器
  const envListContainer = document.getElementById('env-list');
  if (!envListContainer) {
    console.error('找不到环境列表容器元素!');
    return;
  }
  
  // 环境分组选择器
  const groupSelector = document.getElementById('group-selector');
  if (groupSelector) {
    groupSelector.addEventListener('change', function() {
      fetchEnvironmentList(this.value);
    });
  }
  
  // 初始获取环境列表
  fetchEnvironmentList();
}

/**
 * 更新环境状态并刷新UI
 * @param {string} envId - 环境ID
 * @param {boolean} isRunning - 是否正在运行
 */
function updateEnvironmentStatus(envId, isRunning) {
  if (!envId) return;
  
  // 找到对应的环境项
  const envItem = document.querySelector(`.env-item[data-id="${envId}"]`);
  if (!envItem) return;
  
  // 更新状态显示
  const statusEl = envItem.querySelector('.env-status');
  if (statusEl) {
    statusEl.className = `env-status ${isRunning ? 'status-running' : 'status-stopped'}`;
    statusEl.textContent = isRunning ? '运行中' : '已停止';
  }
  
  // 更新按钮状态
  const startBtn = envItem.querySelector('.btn-start');
  if (startBtn) {
    startBtn.disabled = isRunning;
  }
  
  const stopBtn = envItem.querySelector('.btn-stop');
  if (stopBtn) {
    stopBtn.disabled = !isRunning;
  }
  
  // 更新元素检查器按钮状态
  const inspectBtn = envItem.querySelector('.btn-inspect');
  if (inspectBtn) {
    inspectBtn.disabled = !isRunning;
  }
  
  // 更新环境列表中的数据
  const envIndex = app.environments.findIndex(e => e.user_id === envId || e.id === envId);
  if (envIndex !== -1) {
    app.environments[envIndex].is_running = isRunning;
  }
}
