# AdsPower多环境管理工具

AdsPower多环境管理工具是一个功能强大的浏览器环境管理软件，支持多环境管理、AI辅助功能和元素检查器等功能。

## API密钥配置说明

本工具需要配置以下API密钥才能完整使用所有功能：

### 1. AdsPower API

AdsPower API用于与AdsPower浏览器实例通信，需要确保：
- AdsPower软件已在本地安装并启动
- 在AdsPower中启用了API功能（Settings -> Advanced -> Developer options -> Enable API）
- 默认端口为50325，可在设置页面修改

### 2. AI功能API密钥（可选）

AI功能需要以下任一API密钥：

- **OpenAI API密钥**
  - 格式为 `sk-...` 的密钥
  - 可从[OpenAI平台](https://platform.openai.com/account/api-keys)获取
  - 用于AI辅助功能，如元素识别和智能操作

- **DeepSeek API密钥**
  - 格式为 `sk-...` 的密钥
  - 可从[DeepSeek平台](https://platform.deepseek.com)获取
  - 作为备选AI模型

## 首次使用配置流程

1. 启动应用后，点击界面上的"API设置"按钮
2. 在设置页面填写相应的API密钥
3. 点击"保存设置"按钮应用更改
4. 配置完成后，所有功能将正常可用

## 安全说明

- 所有API密钥均保存在本地配置文件中（`/config/config.json`）
- 密钥不会被发送到任何第三方服务器
- 分享代码时，请确保不包含配置文件中的密钥信息

## 本地开发

如需在本地开发此应用：

1. 安装依赖：`npm install`
2. 启动应用：`node app.js`
3. 访问：`http://localhost:3002`

## 故障排除

如遇到问题：

- 检查AdsPower是否正常运行
- 确认API密钥是否正确配置
- 查看应用日志获取更多信息
- 使用"API诊断"页面检查连接状态

## 支持的功能

- 多环境管理
- AI辅助操作
- 元素检查器
- 环境状态监控
- 批量操作支持

## 主要功能

- **环境管理**：批量管理AdsPower浏览器环境，支持启动、停止和监控
- **任务自动化**：预设任务模板，序列化任务执行，任务定时执行
- **AI辅助**：集成OpenAI和DeepSeek，支持自然语言指令控制浏览器
- **错误分析**：智能错误分析和建议，提高自动化任务稳定性
- **浏览器探索**：内置元素探索器，便于交互式调试
- **执行录制**：可选择性录制任务执行过程，支持回放和分析
- **深度搜索**：支持Browser Use WebUI的深度网络搜索功能

## 系统要求

- Node.js 14.0+
- AdsPower 浏览器 (v4.0+)
- Browser Use WebUI (可选，提供更强大的AI自动化能力)

## 安装方法

1. 克隆仓库：
```bash
git clone https://github.com/yourusername/adspower-manager.git
cd adspower-manager
```

2. 安装依赖：
```bash
npm install
# 或
yarn install
```

3. 配置环境变量：
```bash
# OpenAI API密钥 (可选)
export OPENAI_API_KEY=your-openai-api-key

# DeepSeek API密钥 (可选)
export DEEPSEEK_API_KEY=your-deepseek-api-key
```

4. 启动应用：
```bash
npm start
# 或
yarn start
```

5. 访问Web界面：
```
http://localhost:3000
```

## 配置选项

编辑 `config/config.json` 文件可自定义以下选项：

- `port`: 应用监听端口 (默认: 3000)
- `adspowerApiUrl`: AdsPower API URL (默认: http://localhost:50325/api/v1)
- `browserUseApiUrl`: Browser Use WebUI API URL (默认: http://127.0.0.1:7788/api)
- `recordingsPath`: 录制文件保存路径
- `maxRecordingSize`: 最大录制存储空间 (默认: 1GB)
- `aiProviders`: AI提供商配置
- `defaultGroupId`: 默认分组ID

## 使用方法

### 环境管理

1. 主界面显示所有可用的AdsPower环境
2. 使用"启动"和"停止"按钮控制环境
3. 添加环境备注以便识别和管理
4. 使用"探索"按钮打开元素探索器

### 任务执行

1. 在任务面板选择预设任务
2. 填写任务所需的变量
3. 选择目标环境
4. 运行任务并查看执行状态

### AI指令

1. 在AI指令输入框中输入自然语言指令
2. 如"访问百度并搜索AdsPower"
3. AI将自动执行相应操作

### 元素探索器

1. 在环境卡片上点击"探索"按钮
2. 使用选择器搜索元素
3. 点击列表中的元素查看详情
4. 使用"点击元素"或"输入文本"按钮与元素交互

### 错误分析

1. 点击底部"错误分析"面板
2. 查看错误统计和常见错误
3. 根据AI提供的建议修复问题

## 高级用法

### 自定义任务

在 `config/tasks.json` 文件中添加自定义任务模板：

```json
{
  "id": "custom-task",
  "name": "自定义任务",
  "description": "任务描述",
  "actions": [
    { "type": "navigate", "url": "https://example.com" },
    { "type": "click", "selector": "#submit-button" },
    ...
  ],
  "variables": [
    {
      "name": "example",
      "description": "示例变量",
      "required": true
    }
  ]
}
```

### API集成

RESTful API可以通过HTTP请求控制管理器：

- `GET /api/environments`: 获取环境列表
- `POST /api/environments/:id/start`: 启动环境
- `POST /api/environments/:id/stop`: 停止环境
- `POST /api/environments/:id/task`: 在环境中执行任务
- `POST /api/command`: 执行AI指令

### WebSocket通知

连接到 `/ws` 端点可接收实时通知：

```javascript
const socket = new WebSocket('ws://localhost:3000/ws');
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log(message);
};
```

## 贡献指南

欢迎提交问题和功能请求。如需贡献代码：

1. Fork项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建Pull Request

## 许可证

MIT 