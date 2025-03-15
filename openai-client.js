const axios = require('axios');

class OpenAIClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.vveai.com';
  }

  /**
   * 生成Puppeteer浏览器自动化命令
   * @param {string} command - 用户的自然语言命令
   * @returns {Promise<string>} - 生成的Puppeteer代码
   */
  async generateBrowserCommands(command) {
    try {
      const response = await axios({
        method: 'post',
        url: `${this.baseURL}/v1/chat/completions`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        data: {
          model: 'gpt-4o', // 使用GPT-4o模型
          messages: [
            {
              role: 'system',
              content: '你是一位浏览器自动化专家，精通Puppeteer。请将用户的自然语言指令转换为可执行的Puppeteer代码。仅返回代码，无需解释。代码应包含在async函数中，并使用page对象执行操作。'
            },
            {
              role: 'user',
              content: `请将以下指令转换为Puppeteer代码：${command}`
            }
          ],
          temperature: 0.3, // 降低随机性，获得一致的代码
          max_tokens: 1000
        },
        timeout: 60000 // 60秒超时
      });

      // 提取返回的代码
      const generatedCode = response.data.choices[0].message.content;
      console.log('OpenAI 生成的代码:', generatedCode);
      return generatedCode;
    } catch (error) {
      console.error('OpenAI API 调用失败:', error.response?.data || error.message);
      throw new Error(`无法生成代码: ${error.message}`);
    }
  }
}

module.exports = OpenAIClient;
