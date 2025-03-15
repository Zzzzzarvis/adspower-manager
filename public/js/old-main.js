/**
 * AdsPower多环境管理工具 - 旧版界面JS
 */

// 全局变量
let allEnvironments = [];
let selectedEnvId = null;
let currentTaskLogs = {};
let allAiModels = [];
let defaultAiModel = '';

// 初始化应用
$(document).ready(function() {
    // 初始化UI
    initializeUI();
    
    // 获取环境列表
    fetchEnvironments();
    
    // 获取AI模型列表
    fetchAiModels();
    
    // 初始化任务选择器
    populateTaskSelector();
    
    // 初始化事件监听器
    initializeEventListeners();
});

/**
 * 初始化UI元素
 */
function initializeUI() {
    // 导航菜单点击
    $('.nav-item').click(function() {
        $('.nav-item').removeClass('active');
        $(this).addClass('active');
    });
}

/**
 * 获取环境列表
 */
function fetchEnvironments() {
    const selectedGroup = $('#group-selector').val();
    const searchTerm = $('#env-search').val().trim();
    
    $.ajax({
        url: '/api/environments',
        method: 'GET',
        data: { 
            group: selectedGroup,
            search: searchTerm
        },
        success: function(response) {
            if (response.success) {
                allEnvironments = response.environments;
                renderEnvironmentsList(allEnvironments);
            } else {
                showError('获取环境列表失败: ' + response.message);
            }
        },
        error: function(error) {
            showError('请求环境列表时出错');
            console.error('获取环境列表出错:', error);
        }
    });
}

/**
 * 渲染环境列表
 */
function renderEnvironmentsList(environments) {
    const envListContainer = $('.env-list');
    envListContainer.empty();
    
    if (environments.length === 0) {
        envListContainer.append('<div class="no-data">没有找到环境</div>');
        return;
    }
    
    // 添加批量操作复选框
    const batchHeader = $('<div>', {
        class: 'batch-header'
    });
    
    const selectAllCheckbox = $('<input>', {
        type: 'checkbox',
        id: 'select-all-envs',
        class: 'batch-checkbox'
    });
    
    const selectAllLabel = $('<label>', {
        for: 'select-all-envs',
        text: '全选'
    });
    
    const batchActions = $('<div>', {
        class: 'batch-actions'
    });
    
    const batchStartBtn = $('<button>', {
        class: 'btn-batch btn-batch-start',
        text: '批量启动'
    });
    
    const batchStopBtn = $('<button>', {
        class: 'btn-batch btn-batch-stop',
        text: '批量停止'
    });
    
    batchActions.append(batchStartBtn, batchStopBtn);
    batchHeader.append(selectAllCheckbox, selectAllLabel, batchActions);
    envListContainer.append(batchHeader);
    
    environments.forEach(env => {
        const isRunning = env.status === 'running';
        
        const envItem = $('<div>', {
            class: 'env-item',
            'data-id': env.id
        });
        
        const batchCheckbox = $('<input>', {
            type: 'checkbox',
            class: 'env-checkbox',
            'data-id': env.id
        });
        
        const envInfo = $('<div>', {
            class: 'env-info'
        });
        
        const envName = $('<div>', {
            class: 'env-name',
            text: env.name
        });
        
        const envMeta = $('<div>', {
            class: 'env-meta'
        });
        
        const envId = $('<span>', {
            class: 'env-id',
            text: 'ID: ' + env.id
        });
        
        const statusClass = isRunning ? 'status-running' : 'status-stopped';
        const statusText = isRunning ? '运行中' : '已停止';
        
        const envStatus = $('<span>', {
            class: 'env-status ' + statusClass,
            text: statusText
        });
        
        envMeta.append(envId);
        envInfo.append(envName, envMeta, envStatus);
        
        const envActions = $('<div>', {
            class: 'env-actions'
        });
        
        if (isRunning) {
            const stopBtn = $('<button>', {
                class: 'btn-action btn-stop',
                'data-id': env.id,
                text: '停止'
            });
            
            const exploreBtn = $('<button>', {
                class: 'btn-action btn-explore',
                'data-id': env.id,
                text: '检查元素'
            });
            
            envActions.append(stopBtn, exploreBtn);
        } else {
            const startBtn = $('<button>', {
                class: 'btn-action btn-start',
                'data-id': env.id,
                text: '启动'
            });
            
            envActions.append(startBtn);
        }
        
        envItem.append(batchCheckbox, envInfo, envActions);
        envListContainer.append(envItem);
    });
    
    // 绑定环境项点击事件
    $('.env-item').click(function(e) {
        if (!$(e.target).is('button, input')) {
            const envId = $(this).data('id');
            selectEnvironment(envId);
        }
    });
    
    // 绑定按钮点击事件
    $('.btn-start').click(function() {
        const envId = $(this).data('id');
        startEnvironment(envId);
    });
    
    $('.btn-stop').click(function() {
        const envId = $(this).data('id');
        stopEnvironment(envId);
    });
    
    $('.btn-explore').click(function() {
        const envId = $(this).data('id');
        openElementExplorer(envId);
    });
    
    // 绑定批量操作事件
    $('#select-all-envs').change(function() {
        const isChecked = $(this).prop('checked');
        $('.env-checkbox').prop('checked', isChecked);
    });
    
    $('.btn-batch-start').click(function() {
        batchStartEnvironments();
    });
    
    $('.btn-batch-stop').click(function() {
        batchStopEnvironments();
    });
}

/**
 * 批量启动环境
 */
function batchStartEnvironments() {
    const selectedEnvs = [];
    
    $('.env-checkbox:checked').each(function() {
        const envId = $(this).data('id');
        const env = allEnvironments.find(e => e.id === envId);
        
        if (env && env.status !== 'running') {
            selectedEnvs.push(envId);
        }
    });
    
    if (selectedEnvs.length === 0) {
        showError('请选择至少一个已停止的环境');
        return;
    }
    
    addLogEntry(`批量启动 ${selectedEnvs.length} 个环境...`, 'info');
    
    $.ajax({
        url: '/api/environment/batch-start',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ envIds: selectedEnvs }),
        success: function(response) {
            if (response.success) {
                addLogEntry(`已开始批量启动 ${selectedEnvs.length} 个环境`, 'info');
                
                // 延迟刷新环境列表
                setTimeout(fetchEnvironments, 3000);
            } else {
                addLogEntry(`批量启动失败: ${response.message}`, 'error');
            }
        },
        error: function(error) {
            addLogEntry('批量启动请求失败', 'error');
            console.error('批量启动环境出错:', error);
        }
    });
}

/**
 * 批量停止环境
 */
function batchStopEnvironments() {
    const selectedEnvs = [];
    
    $('.env-checkbox:checked').each(function() {
        const envId = $(this).data('id');
        const env = allEnvironments.find(e => e.id === envId);
        
        if (env && env.status === 'running') {
            selectedEnvs.push(envId);
        }
    });
    
    if (selectedEnvs.length === 0) {
        showError('请选择至少一个运行中的环境');
        return;
    }
    
    addLogEntry(`批量停止 ${selectedEnvs.length} 个环境...`, 'info');
    
    $.ajax({
        url: '/api/environment/batch-stop',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ envIds: selectedEnvs }),
        success: function(response) {
            if (response.success) {
                addLogEntry(`已开始批量停止 ${selectedEnvs.length} 个环境`, 'info');
                
                // 延迟刷新环境列表
                setTimeout(fetchEnvironments, 3000);
            } else {
                addLogEntry(`批量停止失败: ${response.message}`, 'error');
            }
        },
        error: function(error) {
            addLogEntry('批量停止请求失败', 'error');
            console.error('批量停止环境出错:', error);
        }
    });
}

/**
 * 选择环境
 */
function selectEnvironment(envId) {
    selectedEnvId = envId;
    $('.env-item').removeClass('selected');
    $(`.env-item[data-id="${envId}"]`).addClass('selected');
    
    // 获取环境相关的日志
    fetchEnvLogs(envId);
}

/**
 * 启动环境
 */
function startEnvironment(envId) {
    // 显示启动进度模态对话框
    $('#startEnvId').text(envId);
    $('#startModal').modal('show');
    
    // 添加日志条目
    addLogEntry(`正在启动环境 ${envId}...`, 'info');
    
    $.ajax({
        url: '/api/environment/start/' + envId,
        method: 'POST',
        success: function(response) {
            setTimeout(function() {
                $('#startModal').modal('hide');
                
                if (response.success) {
                    addLogEntry(`环境 ${envId} 启动成功`, 'info');
                    fetchEnvironments(); // 刷新环境列表
                } else {
                    addLogEntry(`环境 ${envId} 启动失败: ${response.message}`, 'error');
                }
            }, 2000);
        },
        error: function(error) {
            $('#startModal').modal('hide');
            addLogEntry(`环境 ${envId} 启动请求失败`, 'error');
            console.error('启动环境出错:', error);
        }
    });
}

/**
 * 停止环境
 */
function stopEnvironment(envId) {
    addLogEntry(`正在停止环境 ${envId}...`, 'info');
    
    $.ajax({
        url: '/api/environment/stop/' + envId,
        method: 'POST',
        success: function(response) {
            if (response.success) {
                addLogEntry(`环境 ${envId} 已停止`, 'info');
                fetchEnvironments(); // 刷新环境列表
            } else {
                addLogEntry(`环境 ${envId} 停止失败: ${response.message}`, 'error');
            }
        },
        error: function(error) {
            addLogEntry(`环境 ${envId} 停止请求失败`, 'error');
            console.error('停止环境出错:', error);
        }
    });
}

/**
 * 打开元素检查器
 */
function openElementExplorer(envId) {
    window.open(`/element-explorer/${envId}`, '_blank');
}

/**
 * 获取环境日志
 */
function fetchEnvLogs(envId) {
    $.ajax({
        url: '/api/logs/' + envId,
        method: 'GET',
        success: function(response) {
            if (response.success) {
                renderLogs(response.logs);
            } else {
                showError('获取日志失败: ' + response.message);
            }
        },
        error: function(error) {
            showError('请求日志时出错');
            console.error('获取日志出错:', error);
        }
    });
}

/**
 * 渲染日志
 */
function renderLogs(logs) {
    const logsContainer = $('.logs-container');
    logsContainer.empty();
    
    if (!logs || logs.length === 0) {
        logsContainer.append('<div class="no-logs">没有日志记录</div>');
        return;
    }
    
    logs.forEach(log => {
        const logTime = formatTimestamp(log.timestamp);
        const logLevel = log.level || 'info';
        
        const logEntry = $('<div>', {
            class: 'log-entry'
        });
        
        const timeSpan = $('<span>', {
            class: 'log-time',
            text: logTime
        });
        
        const messageSpan = $('<span>', {
            class: 'log-level-' + logLevel,
            text: log.message
        });
        
        logEntry.append(timeSpan, messageSpan);
        logsContainer.append(logEntry);
    });
    
    // 滚动到底部
    logsContainer.scrollTop(logsContainer[0].scrollHeight);
}

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

/**
 * 添加日志条目
 */
function addLogEntry(message, level = 'info') {
    const logsContainer = $('.logs-container');
    const timestamp = new Date().toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    const logEntry = $('<div>', {
        class: 'log-entry'
    });
    
    const timeSpan = $('<span>', {
        class: 'log-time',
        text: timestamp
    });
    
    const messageSpan = $('<span>', {
        class: 'log-level-' + level,
        text: message
    });
    
    logEntry.append(timeSpan, messageSpan);
    logsContainer.append(logEntry);
    
    // 滚动到底部
    logsContainer.scrollTop(logsContainer[0].scrollHeight);
}

/**
 * 显示错误消息
 */
function showError(message) {
    addLogEntry(message, 'error');
}

/**
 * 填充任务选择器
 */
function populateTaskSelector() {
    $.ajax({
        url: '/api/tasks',
        method: 'GET',
        success: function(response) {
            if (response.success) {
                const taskSelector = $('#task-selector');
                taskSelector.empty();
                
                taskSelector.append($('<option>', {
                    value: '',
                    text: '选择预设任务...'
                }));
                
                response.tasks.forEach(task => {
                    taskSelector.append($('<option>', {
                        value: task.id,
                        text: task.name
                    }));
                });
            }
        },
        error: function(error) {
            console.error('获取任务列表出错:', error);
        }
    });
}

/**
 * 获取AI模型列表
 */
function fetchAiModels() {
    $.ajax({
        url: '/api/ai/models',
        method: 'GET',
        success: function(response) {
            if (response.success) {
                allAiModels = response.models;
                defaultAiModel = response.defaultModelId;
                populateAiModelSelector();
            }
        },
        error: function(error) {
            console.error('获取AI模型列表出错:', error);
        }
    });
}

/**
 * 填充AI模型选择器
 */
function populateAiModelSelector() {
    const modelSelector = $('.ai-model-selector');
    modelSelector.empty();
    
    allAiModels.forEach(model => {
        const option = $('<option>', {
            value: model.id,
            text: model.name
        });
        
        if (model.id === defaultAiModel) {
            option.attr('selected', 'selected');
        }
        
        modelSelector.append(option);
    });
}

/**
 * 执行AI命令
 */
function executeAiCommand() {
    const command = $('#ai-command-input').val().trim();
    const modelId = $('.ai-model-selector').val();
    
    if (!command) {
        showError('命令内容不能为空');
        return;
    }
    
    if (!selectedEnvId) {
        showError('请先选择一个环境');
        return;
    }
    
    addLogEntry(`执行AI命令: ${command}`, 'info');
    
    $.ajax({
        url: '/api/ai/execute',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            envId: selectedEnvId,
            modelId: modelId,
            command: command
        }),
        success: function(response) {
            if (response.success) {
                addLogEntry('AI命令执行成功', 'info');
                
                // 如果有代码响应，显示它
                if (response.code) {
                    addLogEntry('生成的代码:', 'info');
                    addLogEntry(response.code, 'info');
                }
                
                // 如果命令被执行，显示结果
                if (response.result) {
                    addLogEntry('执行结果:', 'info');
                    addLogEntry(response.result, 'info');
                }
            } else {
                addLogEntry(`AI命令执行失败: ${response.message}`, 'error');
            }
        },
        error: function(error) {
            addLogEntry('AI命令请求失败', 'error');
            console.error('AI命令执行出错:', error);
        }
    });
}

/**
 * 执行预设任务
 */
function executeTask() {
    const taskId = $('#task-selector').val();
    
    if (!taskId) {
        showError('请选择一个任务');
        return;
    }
    
    if (!selectedEnvId) {
        showError('请先选择一个环境');
        return;
    }
    
    addLogEntry(`执行任务: ${$('#task-selector option:selected').text()}`, 'info');
    
    $.ajax({
        url: '/api/task/execute',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            envId: selectedEnvId,
            taskId: taskId
        }),
        success: function(response) {
            if (response.success) {
                addLogEntry('任务开始执行', 'info');
                
                // 开始轮询任务状态
                currentTaskLogs[taskId] = [];
                pollTaskStatus(response.executionId);
            } else {
                addLogEntry(`任务执行失败: ${response.message}`, 'error');
            }
        },
        error: function(error) {
            addLogEntry('任务请求失败', 'error');
            console.error('任务执行出错:', error);
        }
    });
}

/**
 * 轮询任务状态
 */
function pollTaskStatus(executionId) {
    const interval = setInterval(function() {
        $.ajax({
            url: '/api/task/status/' + executionId,
            method: 'GET',
            success: function(response) {
                if (response.success) {
                    // 更新日志
                    if (response.logs && response.logs.length > 0) {
                        response.logs.forEach(log => {
                            addLogEntry(log.message, log.level);
                        });
                    }
                    
                    // 检查任务是否完成
                    if (response.status === 'completed') {
                        addLogEntry('任务执行完成', 'info');
                        clearInterval(interval);
                    } else if (response.status === 'failed') {
                        addLogEntry(`任务执行失败: ${response.errorMessage}`, 'error');
                        clearInterval(interval);
                    }
                } else {
                    addLogEntry(`获取任务状态失败: ${response.message}`, 'error');
                    clearInterval(interval);
                }
            },
            error: function(error) {
                addLogEntry('获取任务状态请求失败', 'error');
                console.error('获取任务状态出错:', error);
                clearInterval(interval);
            }
        });
    }, 2000); // 每2秒轮询一次
}

/**
 * 初始化事件监听器
 */
function initializeEventListeners() {
    // 分组选择变更
    $('#group-selector').change(function() {
        fetchEnvironments();
    });
    
    // 环境搜索
    $('#env-search').on('input', function() {
        if ($(this).val().trim().length === 0 || $(this).val().trim().length > 2) {
            fetchEnvironments();
        }
    });
    
    // 搜索按钮点击
    $('#search-btn').click(function() {
        fetchEnvironments();
    });
    
    // 执行AI命令按钮点击
    $('#execute-ai-btn').click(function() {
        executeAiCommand();
    });
    
    // AI命令输入框回车事件
    $('#ai-command-input').keypress(function(e) {
        if (e.which === 13 && !e.shiftKey) {
            e.preventDefault();
            executeAiCommand();
        }
    });
    
    // 执行任务按钮点击
    $('#execute-task-btn').click(function() {
        executeTask();
    });
    
    // 清除日志按钮点击
    $('#clear-logs-btn').click(function() {
        $('.logs-container').empty();
    });
    
    // 刷新环境列表按钮点击
    $('#refresh-env-btn').click(function() {
        fetchEnvironments();
    });
    
    // 导出日志按钮点击
    $('#export-logs-btn').click(function() {
        exportLogs();
    });
}

/**
 * 导出日志
 */
function exportLogs() {
    const logs = [];
    
    $('.log-entry').each(function() {
        const time = $(this).find('.log-time').text();
        const message = $(this).find('span:not(.log-time)').text();
        logs.push(`[${time}] ${message}`);
    });
    
    if (logs.length === 0) {
        showError('没有可导出的日志');
        return;
    }
    
    const logText = logs.join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `adspower-logs-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(function() {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
    
    addLogEntry('日志已导出', 'info');
} 