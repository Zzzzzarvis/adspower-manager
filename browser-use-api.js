/**
 * Browser Use Web UI API 接口文档
 * 
 * 该文件整理了Browser Use Web UI的API接口，提供了Python和JavaScript的调用示例
 * 服务默认地址: http://127.0.0.1:7788/
 */

/**
 * Python API调用示例
 * 
 * 以下是使用Python gradio_client进行API调用的基本示例:
 * 
 * ```python
 * from gradio_client import Client
 * 
 * # 创建客户端连接
 * client = Client("http://127.0.0.1:7788/")
 * 
 * # 调用API
 * result = client.predict(
 *     task="go to google.com and search for AdsPower",
 *     llm_provider="openai",
 *     api_name="/run_with_stream"
 * )
 * print(result)
 * ```
 */

/**
 * Browser Use Web UI API列表
 */
const BrowserUseAPI = {
    /**
     * 更新LLM上下文可见性
     * @param {string} llm_provider - LLM提供商，默认"openai"
     * @returns {number} - 最大上下文长度
     */
    updateLlmNumCtxVisibility: {
        endpoint: "/update_llm_num_ctx_visibility",
        description: "更新LLM上下文可见性设置",
        pythonExample: `
from gradio_client import Client

client = Client("http://127.0.0.1:7788/")
result = client.predict(
    llm_provider="openai",
    api_name="/update_llm_num_ctx_visibility"
)
print(result)
`
    },

    /**
     * 停止代理
     * @returns {string} - 错误信息
     */
    stopAgent: {
        endpoint: "/stop_agent",
        description: "停止当前正在运行的代理",
        pythonExample: `
from gradio_client import Client

client = Client("http://127.0.0.1:7788/")
result = client.predict(
    api_name="/stop_agent"
)
print(result)
`
    },

    /**
     * 运行自动化任务(带流式输出)
     * @param {Object} params - 运行参数
     * @returns {Array} - 运行结果
     */
    runWithStream: {
        endpoint: "/run_with_stream",
        description: "运行带流式输出的浏览器自动化任务",
        pythonExample: `
from gradio_client import Client

client = Client("http://127.0.0.1:7788/")
result = client.predict(
    agent_type="custom",
    llm_provider="openai",
    llm_model_name="gpt-4o",
    llm_num_ctx=32000,
    llm_temperature=1,
    llm_base_url="",
    llm_api_key="",
    use_own_browser=True,
    keep_browser_open=False,
    headless=False,
    disable_security=True,
    window_w=1280,
    window_h=1100,
    save_recording_path="./tmp/record_videos",
    save_agent_history_path="./tmp/agent_history",
    save_trace_path="./tmp/traces",
    enable_recording=True,
    task="go to google.com and type 'OpenAI' click search and give me the first url",
    add_infos="Hello!!",
    max_steps=100,
    use_vision=True,
    max_actions_per_step=10,
    tool_calling_method="auto",
    api_name="/run_with_stream"
)
print(result)
`
    },

    /**
     * 运行深度搜索
     * @param {Object} params - 搜索参数
     * @returns {Array} - 搜索结果
     */
    runDeepSearch: {
        endpoint: "/run_deep_search",
        description: "进行深度网络搜索并生成研究报告",
        pythonExample: `
from gradio_client import Client

client = Client("http://127.0.0.1:7788/")
result = client.predict(
    research_task="Compose a report on the use of Reinforcement Learning for training Large Language Models",
    max_search_iteration_input=3,
    max_query_per_iter_input=1,
    llm_provider="openai",
    llm_model_name="gpt-4o",
    llm_num_ctx=32000,
    llm_temperature=1,
    llm_base_url="",
    llm_api_key="",
    use_vision=True,
    use_own_browser=True,
    headless=False,
    api_name="/run_deep_search"
)
print(result)
`
    },

    /**
     * 停止研究代理
     * @returns {any} - 结果
     */
    stopResearchAgent: {
        endpoint: "/stop_research_agent",
        description: "停止当前正在运行的研究代理",
        pythonExample: `
from gradio_client import Client

client = Client("http://127.0.0.1:7788/")
result = client.predict(
    api_name="/stop_research_agent"
)
print(result)
`
    },

    /**
     * 列出录制视频
     * @param {string} save_recording_path - 录制保存路径
     * @returns {Array} - 录制列表
     */
    listRecordings: {
        endpoint: "/list_recordings",
        description: "列出保存的录制视频",
        pythonExample: `
from gradio_client import Client

client = Client("http://127.0.0.1:7788/")
result = client.predict(
    save_recording_path="./tmp/record_videos",
    api_name="/list_recordings"
)
print(result)
`
    },

    /**
     * 从配置文件更新UI
     * @param {File} config_file - 配置文件
     * @returns {Array} - UI更新结果
     */
    updateUiFromConfig: {
        endpoint: "/update_ui_from_config",
        description: "从配置文件更新UI设置",
        pythonExample: `
from gradio_client import Client, handle_file

client = Client("http://127.0.0.1:7788/")
result = client.predict(
    config_file=handle_file('path/to/config.json'),
    api_name="/update_ui_from_config"
)
print(result)
`
    },

    /**
     * 保存当前配置
     * @param {Object} params - 当前配置参数
     * @returns {string} - 状态信息
     */
    saveCurrentConfig: {
        endpoint: "/save_current_config",
        description: "保存当前配置到文件",
        pythonExample: `
from gradio_client import Client

client = Client("http://127.0.0.1:7788/")
result = client.predict(
    param_0="custom",
    param_1=100,
    param_2=10,
    param_3=True,
    param_4="auto",
    param_5="openai",
    param_6="gpt-4o",
    param_7=32000,
    param_8=1,
    param_9="",
    param_10="",
    param_11=True,
    param_12=False,
    param_13=False,
    param_14=True,
    param_15=True,
    param_16=1280,
    param_17=1100,
    param_18="./tmp/record_videos",
    param_19="./tmp/traces",
    param_20="./tmp/agent_history",
    param_21="go to google.com and type 'OpenAI' click search and give me the first url",
    api_name="/save_current_config"
)
print(result)
`
    },

    /**
     * 根据提供商获取模型列表
     * @param {string} provider - LLM提供商
     * @param {string} api_key - API密钥
     * @param {string} base_url - 基础URL
     * @returns {string} - 模型名称
     */
    getLlmModels: {
        endpoint: "/lambda",
        description: "根据提供商获取可用模型列表",
        pythonExample: `
from gradio_client import Client

client = Client("http://127.0.0.1:7788/")
result = client.predict(
    provider="openai",
    api_key="",
    base_url="",
    api_name="/lambda"
)
print(result)
`
    },

    /**
     * 获取录制路径
     * @param {boolean} enabled - 是否启用录制
     * @returns {string} - 录制路径
     */
    getRecordingPath: {
        endpoint: "/lambda_1",
        description: "获取录制保存路径",
        pythonExample: `
from gradio_client import Client

client = Client("http://127.0.0.1:7788/")
result = client.predict(
    enabled=True,
    api_name="/lambda_1"
)
print(result)
`
    },

    /**
     * 关闭全局浏览器
     * @returns {any} - 结果
     */
    closeGlobalBrowser: {
        endpoint: "/close_global_browser",
        description: "关闭全局浏览器实例",
        pythonExample: `
from gradio_client import Client

client = Client("http://127.0.0.1:7788/")
result = client.predict(
    api_name="/close_global_browser"
)
print(result)
`
    },

    /**
     * 关闭全局浏览器(备用)
     * @returns {any} - 结果
     */
    closeGlobalBrowser1: {
        endpoint: "/close_global_browser_1",
        description: "备用关闭全局浏览器方法",
        pythonExample: `
from gradio_client import Client

client = Client("http://127.0.0.1:7788/")
result = client.predict(
    api_name="/close_global_browser_1"
)
print(result)
`
    }
};

/**
 * JavaScript版本调用示例
 */
class BrowserUseClient {
    constructor(baseUrl = "http://127.0.0.1:7788") {
        this.baseUrl = baseUrl;
    }

    /**
     * 调用Browser Use API
     * @param {string} endpoint - API端点
     * @param {Object} params - 参数
     * @returns {Promise<any>} - API响应
     */
    async callApi(endpoint, params = {}) {
        try {
            const response = await fetch(`${this.baseUrl}/api${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(params)
            });

            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`调用Browser Use API失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 运行自动化任务
     * @param {Object} params - 任务参数
     * @returns {Promise<any>} - 任务结果
     */
    async runTask(params) {
        const defaultParams = {
            agent_type: "custom",
            llm_provider: "openai",
            llm_model_name: "gpt-4o",
            use_vision: false, // 对DeepSeek设为false
            task: "",
            use_own_browser: true
        };

        return this.callApi(BrowserUseAPI.runWithStream.endpoint, {
            ...defaultParams,
            ...params
        });
    }

    /**
     * 停止当前任务
     * @returns {Promise<any>} - 停止结果
     */
    async stopTask() {
        return this.callApi(BrowserUseAPI.stopAgent.endpoint);
    }

    /**
     * 关闭浏览器
     * @returns {Promise<any>} - 关闭结果
     */
    async closeBrowser() {
        return this.callApi(BrowserUseAPI.closeGlobalBrowser.endpoint);
    }
}

/**
 * 与AdsPower API集成示例
 */
async function runAdsPowerWithBrowserUse(envId, task) {
    try {
        // 1. 启动AdsPower浏览器
        const adsResponse = await axios.get(`http://local.adspower.net:50325/api/v1/browser/start?user_id=${envId}`);
        
        if (adsResponse.data.code !== 0 || !adsResponse.data.data.ws) {
            throw new Error(`启动AdsPower浏览器失败: ${adsResponse.data.msg || '未知错误'}`);
        }
        
        // 2. 使用Browser Use执行任务
        const browserUseClient = new BrowserUseClient();
        const result = await browserUseClient.runTask({
            task: task,
            llm_provider: "deepseek", // 或者 "openai"
            use_vision: false,        // 对DeepSeek设为false
            headless: false
        });
        
        // 3. 任务完成后关闭浏览器
        await axios.get(`http://local.adspower.net:50325/api/v1/browser/stop?user_id=${envId}`);
        
        return result;
    } catch (error) {
        console.error(`执行任务失败: ${error.message}`);
        throw error;
    }
}

// 导出模块
module.exports = {
    BrowserUseAPI,
    BrowserUseClient,
    runAdsPowerWithBrowserUse
}; 