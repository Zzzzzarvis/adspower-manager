# AdsPower与Browser Use WebUI集成

本目录包含了AdsPower Local API和Browser Use WebUI的集成工具，允许您通过编程方式控制AdsPower浏览器并使用AI自动化功能执行任务。

## 文件说明

- `browser-use-api.js` - JavaScript版本的Browser Use WebUI API客户端
- `browser_use_api.py` - Python版本的Browser Use WebUI API客户端

## 前提条件

### JavaScript版本
- Node.js 14+
- axios库 (`npm install axios`)
- fetch API支持

### Python版本
- Python 3.7+
- gradio_client库 (`pip install gradio_client`)
- requests库 (`pip install requests`)

## 使用方法

### Python版本

1. 基础使用:

```python
from browser_use_api import BrowserUseClient

# 创建客户端
client = BrowserUseClient()

# 运行简单任务
result = client.run_task(
    task="访问百度并搜索'AdsPower'，然后获取第一个搜索结果",
    llm_provider="deepseek",  # 或者"openai"
    use_vision=False,         # 如果使用DeepSeek，应设为False
    llm_model_name="deepseek-chat"
)
print(result)
```

2. 与AdsPower集成:

```python
from browser_use_api import AdsPowerBrowserUseIntegration

# 创建集成对象
integration = AdsPowerBrowserUseIntegration()

# 使用AdsPower运行任务
result = integration.run_with_adspower(
    env_id="your_adspower_env_id",  # 替换为您的AdsPower环境ID
    task="访问百度并搜索'AdsPower'，然后获取第一个搜索结果",
    llm_provider="deepseek"
)
print(result)
```

### JavaScript版本

1. 基础使用:

```javascript
const { BrowserUseClient } = require('./browser-use-api');

// 创建客户端
const client = new BrowserUseClient();

// 运行任务
async function runTask() {
    try {
        const result = await client.runTask({
            task: "访问百度并搜索'AdsPower'，然后获取第一个搜索结果",
            llm_provider: "deepseek", // 或者 "openai"
            use_vision: false,        // 如果使用DeepSeek，应设为false
            llm_model_name: "deepseek-chat"
        });
        console.log(result);
    } catch (error) {
        console.error("执行任务失败:", error);
    }
}

runTask();
```

2. 与AdsPower集成:

```javascript
const { runAdsPowerWithBrowserUse } = require('./browser-use-api');

async function main() {
    try {
        const result = await runAdsPowerWithBrowserUse(
            "your_adspower_env_id",  // 替换为您的AdsPower环境ID
            "访问百度并搜索'AdsPower'，然后获取第一个搜索结果"
        );
        console.log(result);
    } catch (error) {
        console.error("执行任务失败:", error);
    }
}

main();
```

## 注意事项

1. **Browser Use WebUI服务**
   - 确保Browser Use WebUI服务正在运行在`http://127.0.0.1:7788`
   - 如果端口不同，请在创建客户端时指定正确的地址

2. **AdsPower服务**
   - 确保AdsPower服务正在运行在`http://local.adspower.net:50325`或`http://localhost:50325`
   - 如果地址不同，请在集成类初始化时指定正确的API地址

3. **DeepSeek特别说明**
   - 使用DeepSeek时，应将`use_vision`设置为`false`，因为DeepSeek不支持视觉功能

4. **模型选择**
   - OpenAI模型推荐: "gpt-4o", "gpt-4", "gpt-3.5-turbo"
   - DeepSeek模型推荐: "deepseek-chat"

## API参考

### BrowserUseClient类

#### Python方法:
- `run_task(task, llm_provider, ...)` - 运行自动化任务
- `stop_task()` - 停止当前任务
- `close_browser()` - 关闭浏览器
- `run_deep_search(research_task, ...)` - 进行深度搜索
- `list_recordings(save_recording_path)` - 列出录制视频

#### JavaScript方法:
- `runTask(params)` - 运行自动化任务
- `stopTask()` - 停止当前任务
- `closeBrowser()` - 关闭浏览器

### AdsPowerBrowserUseIntegration类 (Python)

- `run_with_adspower(env_id, task, ...)` - 使用AdsPower环境运行Browser Use任务

### runAdsPowerWithBrowserUse函数 (JavaScript)

- `runAdsPowerWithBrowserUse(envId, task)` - 使用AdsPower环境运行Browser Use任务

## 故障排除

1. 如果遇到连接问题，请确认：
   - Browser Use WebUI服务是否正在运行
   - AdsPower服务是否正在运行
   - 网络端口是否正确

2. 如果任务执行失败：
   - 检查任务描述是否清晰
   - 确认AI模型是否能访问
   - 查看浏览器是否能正常运行

3. 常见错误：
   - "无法连接到服务" - 检查服务是否运行
   - "API请求失败" - 检查API参数
   - "浏览器启动失败" - 检查AdsPower环境ID
   - "执行任务超时" - 任务可能太复杂，尝试简化任务 