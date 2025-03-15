// AdsPower浏览器控制器
const puppeteer = require('puppeteer-core');

class BrowserController {
  constructor() {
    this.browser = null;
    this.page = null;
    this.connected = false;
  }

  /**
   * 连接到AdsPower浏览器
   * @param {string|object} ws WebSocket URL或包含puppeteer和selenium属性的对象
   */
  async connect(ws) {
    if (!ws) {
      throw new Error('无效的WebSocket URL');
    }
    console.log('连接到WebSocket URL:', ws);
    
    try {
      // 处理ws可能是对象的情况
      const wsEndpoint = typeof ws === 'object' ? ws.puppeteer : ws;
      
      if (!wsEndpoint) {
        throw new Error('无效的WebSocket URL格式，缺少puppeteer属性');
      }
      
      this.browser = await puppeteer.connect({ 
        browserWSEndpoint: wsEndpoint, 
        defaultViewport: null 
      });
      
      const pages = await this.browser.pages();
      this.page = pages[0];
      
      // 设置页面选项
      await this.page.setDefaultTimeout(60000);
      
      // 设置页面事件监听
      this.page.on('dialog', async dialog => {
        console.log('检测到对话框:', dialog.type(), dialog.message());
        await dialog.dismiss();
      });
      
      this.connected = true;
      return true;
    } catch (error) {
      console.error('连接到浏览器失败:', error.message);
      throw new Error(`无效的WebSocket URL: ${ws}`);
    }
  }

  /**
   * 关闭浏览器连接
   */
  async close() {
    try {
      if (this.browser) {
        await this.browser.disconnect();
        this.browser = null;
        this.page = null;
        this.connected = false;
      }
    } catch (error) {
      console.error('关闭浏览器连接出错:', error);
    }
  }

  /**
   * 导航到指定URL
   * @param {string} url 目标URL
   * @param {object} options 导航选项
   */
  async navigate(url, options = {}) {
    if (!this.page) {
      throw new Error('浏览器未连接');
    }
    
    const defaultOptions = {
      waitUntil: 'load',
      timeout: 60000
    };
    
    const navigationOptions = { ...defaultOptions, ...options };
    
    try {
      await this.page.goto(url, navigationOptions);
      return true;
    } catch (error) {
      console.error('导航失败:', error);
      throw error;
    }
  }

  /**
   * 执行JavaScript代码
   * @param {string} script 要执行的脚本
   * @param {object} context 执行上下文
   */
  async executeScript(script, context = {}) {
    if (!this.page) {
      throw new Error('浏览器未连接');
    }
    
    try {
      // 处理字符串脚本
      if (typeof script === 'string') {
        // 创建一个可执行的函数，包含给定的脚本
        const fnBody = `
          try {
            ${script}
          } catch (error) {
            return { error: error.message, stack: error.stack };
          }
        `;
        
        const result = await this.page.evaluate(fnBody);
        
        if (result && result.error) {
          throw new Error(`脚本执行错误: ${result.error}`);
        }
        
        return result;
      } else {
        // 如果script是函数，则直接传入evaluate
        return await this.page.evaluate(script, context);
      }
    } catch (error) {
      console.error('执行脚本失败:', error);
      throw error;
    }
  }

  /**
   * 截取屏幕截图
   * @param {object} options 截图选项
   */
  async screenshot(options = {}) {
    if (!this.page) {
      throw new Error('浏览器未连接');
    }
    
    const defaultOptions = {
      type: 'png',
      encoding: 'base64',
      fullPage: true
    };
    
    const screenshotOptions = { ...defaultOptions, ...options };
    
    try {
      return await this.page.screenshot(screenshotOptions);
    } catch (error) {
      console.error('截图失败:', error);
      throw error;
    }
  }

  /**
   * 获取当前页面URL
   */
  async getCurrentUrl() {
    if (!this.page) {
      throw new Error('浏览器未连接');
    }
    
    try {
      return await this.page.url();
    } catch (error) {
      console.error('获取当前URL失败:', error);
      throw error;
    }
  }

  /**
   * 在页面上点击元素
   * @param {string} selector 要点击的元素选择器
   * @param {object} options 点击选项
   */
  async click(selector, options = {}) {
    if (!this.page) {
      throw new Error('浏览器未连接');
    }
    
    try {
      await this.page.waitForSelector(selector, { timeout: 10000 });
      await this.page.click(selector, options);
      return true;
    } catch (error) {
      console.error('点击元素失败:', error);
      throw error;
    }
  }

  /**
   * 在输入框中输入文本
   * @param {string} selector 输入框选择器
   * @param {string} text 要输入的文本
   * @param {object} options 输入选项
   */
  async type(selector, text, options = {}) {
    if (!this.page) {
      throw new Error('浏览器未连接');
    }
    
    try {
      await this.page.waitForSelector(selector, { timeout: 10000 });
      await this.page.type(selector, text, options);
      return true;
    } catch (error) {
      console.error('输入文本失败:', error);
      throw error;
    }
  }

  /**
   * 等待元素出现
   * @param {string} selector 要等待的元素选择器
   * @param {object} options 等待选项
   */
  async waitForElement(selector, options = {}) {
    if (!this.page) {
      throw new Error('浏览器未连接');
    }
    
    const defaultOptions = {
      visible: true,
      timeout: 30000
    };
    
    const waitOptions = { ...defaultOptions, ...options };
    
    try {
      await this.page.waitForSelector(selector, waitOptions);
      return true;
    } catch (error) {
      console.error('等待元素超时:', error);
      throw error;
    }
  }

  /**
   * 检查浏览器是否已连接
   */
  isConnected() {
    return this.connected && this.browser !== null;
  }
}

module.exports = BrowserController;
