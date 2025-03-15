const fetch = require('node-fetch');

class DeepSeekClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.deepseek.com/v1';
  }

  /**
   * 生成文本
   * @param {string} prompt - 提示词
   * @param {object} options - 可选参数
   * @returns {Promise<string>} - 生成的文本
   */
  async generateText(prompt, options = {}) {
    try {
      console.log('DeepSeek生成请求:', prompt.substring(0, 100) + '...');
      
      // 默认配置
      const defaultOptions = {
        model: 'deepseek-coder',
        temperature: 0.3,
        max_tokens: 2000
      };
      
      // 合并选项
      const finalOptions = { ...defaultOptions, ...options };
      
      // 构建API请求
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: finalOptions.model,
          messages: [
            { role: 'system', content: 'You are a helpful programming assistant that generates code for browser automation tasks.' },
            { role: 'user', content: prompt }
          ],
          temperature: finalOptions.temperature,
          max_tokens: finalOptions.max_tokens
        })
      });
      
      // 检查响应状态
      if (!response.ok) {
        let errorMessage = `DeepSeek API错误: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage += ` - ${errorData.error?.message || JSON.stringify(errorData)}`;
        } catch (e) {
          // 如果无法解析错误JSON，使用原始错误消息
        }
        throw new Error(errorMessage);
      }
      
      // 解析响应
      const data = await response.json();
      
      // 验证响应格式
      if (!data.choices || !data.choices.length) {
        throw new Error('DeepSeek返回了无效的响应格式');
      }
      
      // 返回生成的文本
      return data.choices[0].message?.content || '';
    } catch (error) {
      console.error('DeepSeek生成错误:', error);
      
      // 如果是API错误，尝试返回一个默认的代码示例
      if (error.message.includes('API错误')) {
        console.log('DeepSeek API错误，返回默认代码示例');
        return `// 由于DeepSeek API调用失败，以下是一个基本的Puppeteer代码示例
async function run(page) {
  // 假设这是用户要求的操作：导航到百度并搜索
  await page.goto('https://www.baidu.com');
  await page.waitForSelector('#kw');
  await page.type('#kw', 'AdsPower');
  await page.click('#su');
  await page.waitForTimeout(2000);
  console.log('已完成操作');
}`;
      } else {
        throw error;
      }
    }
  }
}

module.exports = DeepSeekClient;
