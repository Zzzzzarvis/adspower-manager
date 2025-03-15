// 浏览器控制器模块 - 封装浏览器操控逻辑
const puppeteer = require('puppeteer-core');
const logger = require('./logger');

class BrowserController {
  /**
   * 构造函数
   * @param {string} wsEndpoint WebSocket地址
   * @param {string} envId 环境ID
   */
  constructor(wsEndpoint = null, envId = null) {
    this.browser = null;
    this.page = null;
    this.connected = false;
    this.envId = envId;
    this.status = 'disconnected';
    this.wsEndpoint = wsEndpoint;
  }

  /**
   * 初始化浏览器控制器
   * @returns {Promise<boolean>} 初始化是否成功
   */
  async initialize() {
    if (this.wsEndpoint) {
      return this.connect(this.wsEndpoint, this.envId);
    }
    logger.warn(`初始化失败: 未提供WebSocket地址`);
    return false;
  }

  /**
   * 连接到AdsPower浏览器
   * @param {string|object} ws WebSocket URL或包含puppeteer和selenium属性的对象
   * @param {string} envId 环境ID
   * @returns {Promise<boolean>} 连接是否成功
   */
  async connect(ws, envId = null) {
    if (!ws) {
      logger.error('无效的WebSocket URL');
      throw new Error('无效的WebSocket URL');
    }
    
    logger.info(`连接到WebSocket URL: ${typeof ws === 'object' ? JSON.stringify(ws) : ws}`);
    this.status = 'connecting';
    
    try {
      // 处理ws可能是对象的情况
      const wsEndpoint = typeof ws === 'object' ? ws.puppeteer : ws;
      
      if (!wsEndpoint) {
        logger.error('无效的WebSocket URL格式，缺少puppeteer属性');
        throw new Error('无效的WebSocket URL格式，缺少puppeteer属性');
      }
      
      // 连接到浏览器
      this.browser = await puppeteer.connect({ 
        browserWSEndpoint: wsEndpoint, 
        defaultViewport: null 
      });
      
      // 获取所有页面
      const pages = await this.browser.pages();
      if (pages.length > 0) {
        // 默认使用第一个页面
        this.page = pages[0];
        logger.info(`已找到 ${pages.length} 个标签页，默认使用第一个`);
      } else {
        logger.warn('未找到任何页面，尝试创建新页面');
        this.page = await this.browser.newPage();
      }
      
      // 设置页面选项
      await this.page.setDefaultTimeout(60000);
      
      // 设置页面事件监听
      this.page.on('dialog', async dialog => {
        logger.info(`检测到对话框: ${dialog.type()}, ${dialog.message()}`);
        await dialog.dismiss();
      });
      
      // 设置错误事件监听
      this.page.on('error', error => {
        logger.error(`页面错误: ${error.message}`);
      });
      
      // 设置控制台消息监听
      this.page.on('console', msg => {
        if (msg.type() === 'error') {
          logger.error(`页面控制台错误: ${msg.text()}`);
        }
      });
      
      this.connected = true;
      this.envId = envId;
      this.status = 'connected';
      logger.info(`成功连接到浏览器${envId ? ` (环境ID: ${envId})` : ''}`);
      
      return true;
    } catch (error) {
      this.status = 'error';
      logger.error(`连接到浏览器失败: ${error.message}`);
      throw new Error(`连接到浏览器失败: ${error.message}`);
    }
  }

  /**
   * 关闭浏览器连接
   * @returns {Promise<void>}
   */
  async close() {
    try {
      if (this.browser) {
        this.status = 'disconnecting';
        logger.info(`关闭浏览器连接${this.envId ? ` (环境ID: ${this.envId})` : ''}`);
        await this.browser.disconnect();
        this.browser = null;
        this.page = null;
        this.connected = false;
        this.status = 'disconnected';
      }
    } catch (error) {
      this.status = 'error';
      logger.error(`关闭浏览器连接出错: ${error.message}`);
    }
  }

  /**
   * 导航到指定URL
   * @param {string} url 目标URL
   * @param {object} options 导航选项
   * @returns {Promise<boolean>} 导航是否成功
   */
  async navigate(url, options = {}) {
    if (!this.page) {
      logger.error('浏览器未连接');
      throw new Error('浏览器未连接');
    }
    
    const defaultOptions = {
      waitUntil: 'load',
      timeout: 60000
    };
    
    const navigationOptions = { ...defaultOptions, ...options };
    
    try {
      logger.info(`导航到: ${url}`);
      await this.page.goto(url, navigationOptions);
      return true;
    } catch (error) {
      logger.error(`导航失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 执行JavaScript代码
   * @param {string|Function} script 要执行的脚本
   * @param {object} context 执行上下文
   * @returns {Promise<any>} 脚本执行结果
   */
  async executeScript(script, context = {}) {
    if (!this.page) {
      logger.error('浏览器未连接');
      throw new Error('浏览器未连接');
    }
    
    try {
      logger.debug('执行脚本');
      
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
          logger.error(`脚本执行错误: ${result.error}`);
          throw new Error(`脚本执行错误: ${result.error}`);
        }
        
        return result;
      } else {
        // 如果script是函数，则直接传入evaluate
        return await this.page.evaluate(script, context);
      }
    } catch (error) {
      logger.error(`执行脚本失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 截取屏幕截图
   * @param {object} options 截图选项
   * @returns {Promise<string|Buffer>} 截图数据
   */
  async screenshot(options = {}) {
    if (!this.browser) {
      logger.error('浏览器未连接');
      throw new Error('浏览器未连接');
    }
    
    const defaultOptions = {
      type: 'png',
      encoding: 'base64',
      fullPage: true,
      forceRefresh: false,  // 新增强制刷新选项
      useActiveTab: true    // 新增使用活跃标签选项
    };
    
    const screenshotOptions = { ...defaultOptions, ...options };
    const { forceRefresh, useActiveTab, ...puppeteerOptions } = screenshotOptions;
    
    try {
      // 如果设置了使用活跃标签，尝试切换到活跃标签
      if (useActiveTab) {
        try {
          await this.getActiveTab();
          logger.info('已切换到活跃标签');
        } catch (tabError) {
          logger.warn(`切换到活跃标签失败: ${tabError.message}，使用当前标签`);
        }
      }
      
      // 确保我们有page对象
      if (!this.page) {
        const pages = await this.browser.pages();
        if (pages.length > 0) {
          this.page = pages[0];
          logger.info('自动选择第一个标签页');
        } else {
          throw new Error('没有可用的标签页');
        }
      }
      
      // 如果设置了强制刷新，先刷新页面
      if (forceRefresh) {
        logger.info('截图前强制刷新页面');
        try {
          await this.page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
          logger.info('页面刷新完成');
        } catch (reloadError) {
          logger.warn(`页面刷新超时或出错: ${reloadError.message}`);
          // 继续尝试截图，即使刷新失败
        }
      }
      
      // 等待额外的短暂时间确保页面内容已渲染
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 获取当前页面URL，添加到日志
      const currentUrl = await this.page.url();
      logger.info(`获取页面截图，当前URL: ${currentUrl}`);
      
      return await this.page.screenshot(puppeteerOptions);
    } catch (error) {
      logger.error(`截图失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取当前页面URL
   * @returns {Promise<string>} 当前URL
   */
  async getCurrentUrl() {
    if (!this.page) {
      logger.error('浏览器未连接');
      throw new Error('浏览器未连接');
    }
    
    try {
      return await this.page.url();
    } catch (error) {
      logger.error(`获取当前URL失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 在页面上点击元素
   * @param {string} selector 要点击的元素选择器
   * @param {object} options 点击选项
   * @returns {Promise<boolean>} 点击是否成功
   */
  async click(selector, options = {}) {
    if (!this.page) {
      logger.error('浏览器未连接');
      throw new Error('浏览器未连接');
    }
    
    try {
      logger.info(`点击元素: ${selector}`);
      await this.page.waitForSelector(selector, { timeout: 10000 });
      await this.page.click(selector, options);
      return true;
    } catch (error) {
      logger.error(`点击元素失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 在输入框中输入文本
   * @param {string} selector 输入框选择器
   * @param {string} text 要输入的文本
   * @param {object} options 输入选项
   * @returns {Promise<boolean>} 输入是否成功
   */
  async type(selector, text, options = {}) {
    if (!this.page) {
      logger.error('浏览器未连接');
      throw new Error('浏览器未连接');
    }
    
    try {
      logger.info(`在 ${selector} 中输入文本`);
      await this.page.waitForSelector(selector, { timeout: 10000 });
      await this.page.type(selector, text, options);
      return true;
    } catch (error) {
      logger.error(`输入文本失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 等待元素出现
   * @param {string} selector 要等待的元素选择器
   * @param {object} options 等待选项
   * @returns {Promise<boolean>} 等待是否成功
   */
  async waitForElement(selector, options = {}) {
    if (!this.page) {
      logger.error('浏览器未连接');
      throw new Error('浏览器未连接');
    }
    
    const defaultOptions = {
      visible: true,
      timeout: 30000
    };
    
    const waitOptions = { ...defaultOptions, ...options };
    
    try {
      logger.info(`等待元素: ${selector}`);
      await this.page.waitForSelector(selector, waitOptions);
      return true;
    } catch (error) {
      logger.error(`等待元素超时: ${error.message}`);
      throw error;
    }
  }

  /**
   * 检查浏览器是否已连接
   * @returns {boolean} 是否已连接
   */
  isConnected() {
    return this.connected && this.browser !== null;
  }

  /**
   * 获取浏览器状态
   * @returns {string} 状态字符串
   */
  getStatus() {
    return this.status;
  }

  /**
   * 获取环境ID
   * @returns {string|null} 环境ID
   */
  getEnvId() {
    return this.envId;
  }

  /**
   * 获取页面截图
   * @param {object} options 截图选项
   * @returns {Promise<{screenshot: string}>} Base64编码的截图
   */
  async getScreenshot(options = {}) {
    if (!this.page) {
      logger.error('浏览器未连接');
      throw new Error('浏览器未连接');
    }
    
    const defaultOptions = {
      type: 'jpeg',
      quality: 70,
      fullPage: false,
      encoding: 'base64',
      forceRefresh: false  // 新增强制刷新选项
    };
    
    const mergedOptions = { ...defaultOptions, ...options };
    
    try {
      // 使用screenshot方法获取截图
      const screenshot = await this.screenshot(mergedOptions);
      
      return {
        screenshot: `data:image/jpeg;base64,${screenshot}`
      };
    } catch (error) {
      logger.error(`截图失败: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * 获取页面上的可交互元素
   * @param {boolean} forceRefresh 是否强制刷新页面
   * @param {boolean} useActiveTab 是否使用活跃标签页
   * @param {number} tabId 标签页索引
   * @returns {Promise<Array>} 页面元素数组
   */
  async getPageElements(forceRefresh = false, useActiveTab = false, tabId = null) {
    try {
      console.log(`[BrowserController] 获取页面元素, 强制刷新: ${forceRefresh}, 使用活跃标签: ${useActiveTab}, 标签ID: ${tabId}`);
      
      // 如果指定了tabId或useActiveTab，先切换到相应的页面
      if (useActiveTab) {
        await this.switchToActiveTab();
      } else if (tabId) {
        await this.switchToPage(tabId);
      }
      
      // 获取当前URL
      const currentUrl = await this.getCurrentUrl();
      console.log(`[BrowserController] 当前URL: ${currentUrl}`);
      
      // 执行脚本获取页面元素
      const elements = await this.page.evaluate(() => {
        // 辅助函数：获取元素准确的视口坐标
        function getElementExactPosition(element) {
          try {
            // 使用 getClientRects() 获取最准确的矩形信息
            const clientRects = element.getClientRects();
            if (clientRects.length > 0) {
              // 使用第一个客户端矩形（通常是最相关的一个）
              const firstRect = clientRects[0];
              return {
                left: firstRect.left,
                top: firstRect.top,
                right: firstRect.right,
                bottom: firstRect.bottom,
                width: firstRect.width,
                height: firstRect.height
              };
            }
            
            // 如果没有客户端矩形，回退到 getBoundingClientRect
            return element.getBoundingClientRect();
          } catch (e) {
            console.error('获取元素精确位置出错:', e);
            return element.getBoundingClientRect();
          }
        }
        
        function getElementInfo(element, index) {
          try {
            // 获取精确的边界矩形
            const exactRect = getElementExactPosition(element);
            
            // 使用标准的边界矩形作为备用
            const rect = element.getBoundingClientRect();
            
            // 检查元素是否可见
            if (rect.width <= 0 || rect.height <= 0) {
              return null;
            }
            
            // 检查元素是否在视口内
            if (rect.right < 0 || rect.bottom < 0 || 
                rect.left > window.innerWidth || rect.top > window.innerHeight) {
              return null;
            }
            
            // 获取元素计算样式
            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
              return null;
            }
            
            // 检查元素是否在其他元素下面
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const elementAtPoint = document.elementFromPoint(centerX, centerY);
            const isElementOrChild = element === elementAtPoint || element.contains(elementAtPoint) || (elementAtPoint && elementAtPoint.contains(element));
            
            // 检查是否为小型可点击元素
            const isSmallClickable = (rect.width < 40 || rect.height < 40) && (
              element.tagName === 'A' || 
              element.tagName === 'BUTTON' || 
              element.onclick || 
              element.getAttribute('role') === 'button' ||
              element.classList.contains('btn') ||
              element.classList.contains('button') ||
              element.classList.contains('icon') ||
              /icon/i.test(element.className) ||
              /btn/i.test(element.className)
            );
            
            // 对于小型可点击元素，即使被覆盖也要保留
            if (!isElementOrChild && !isSmallClickable) {
              return null;
            }
            
            // 使用更精确的选择器生成算法
            function generateSelector(el) {
              if (!el) return '';
              if (el.id) return `#${el.id}`;
              
              // 对于小的可点击元素，尝试使用data属性或特定的class
              if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
              if (el.getAttribute('data-id')) return `[data-id="${el.getAttribute('data-id')}"]`;
              
              // 对于按钮、链接等常见可点击元素使用更精确的选择器
              if (el.tagName === 'A' || el.tagName === 'BUTTON') {
                if (el.textContent && el.textContent.trim()) {
                  return `${el.tagName.toLowerCase()}:contains("${el.textContent.trim().substring(0, 20)}")`;
                }
                
                // 尝试使用class，但只使用可能表示组件类型的class（避免使用位置或样式类）
                const relevantClasses = Array.from(el.classList).filter(cls => 
                  /btn|button|link|icon|nav|menu|tab|card|item/i.test(cls)
                );
                
                if (relevantClasses.length > 0) {
                  return `${el.tagName.toLowerCase()}.${relevantClasses.join('.')}`;
                }
              }
              
              // 对于小图标元素尝试使用更多特征
              if (rect.width < 40 && rect.height < 40) {
                // 检查是否有内部SVG或图像
                if (el.querySelector('svg') || el.querySelector('img')) {
                  const parent = el.parentElement;
                  if (parent) {
                    const parentSelector = generateSelector(parent);
                    return `${parentSelector} > ${el.tagName.toLowerCase()}`;
                  }
                }
              }
              
              // 回退到基本选择器
              let selector = el.tagName.toLowerCase();
              let parent = el.parentElement;
              if (parent) {
                const children = Array.from(parent.children);
                const childIndex = children.indexOf(el) + 1;
                return `${selector}:nth-child(${childIndex})`;
              }
              
              return selector;
            }
            
            // 获取元素文本内容
            let text = element.innerText || element.textContent || '';
            text = text.trim().replace(/\s+/g, ' ').substring(0, 100);
            
            // 检查是否可点击
            const isClickable = (
              element.tagName === 'A' || 
              element.tagName === 'BUTTON' || 
              element.tagName === 'INPUT' || 
              element.tagName === 'SELECT' || 
              element.tagName === 'TEXTAREA' ||
              element.onclick != null || 
              style.cursor === 'pointer' ||
              element.getAttribute('role') === 'button' ||
              element.hasAttribute('clickable') ||
              element.classList.contains('btn') ||
              element.classList.contains('button') ||
              isSmallClickable
            );
            
            // 获取属性（只获取重要的属性）
            const attributes = {};
            for (const attr of element.attributes) {
              if (['id', 'class', 'name', 'href', 'src', 'alt', 'title', 'role', 'type', 'value', 'placeholder', 'aria-label'].includes(attr.name)) {
                attributes[attr.name] = attr.value;
              }
            }
            
            // 获取计算样式中的相关信息
            const computedStyle = {
              zIndex: style.zIndex,
              position: style.position,
              display: style.display,
              cursor: style.cursor,
              visibility: style.visibility,
              opacity: style.opacity
            };
            
            return {
              id: index,
              tagName: element.tagName.toLowerCase(),
              text: text,
              selector: generateSelector(element),
              rect: {
                x: Math.round(exactRect.left),
                y: Math.round(exactRect.top),
                width: Math.round(exactRect.width),
                height: Math.round(exactRect.height)
              },
              clickable: isClickable,
              isSmallClickable: isSmallClickable,
              attributes: attributes,
              style: computedStyle,
              zIndex: parseInt(style.zIndex) || 0,
              index: index // 保留索引用于点击操作
            };
          } catch (e) {
            console.error('获取元素信息时出错:', e);
            return null;
          }
        }
        
        // 主函数开始
        try {
          // 查找所有可能的交互元素
          const interactiveSelectors = [
            'a', 'button', 'input[type="button"]', 'input[type="submit"]', // 基本按钮元素
            'svg', 'svg *', '.icon', '.icons', '*[class*="icon"]', // SVG和图标元素
            '[onclick]', '[role="button"]', '[role="link"]', // 有事件或ARIA角色的元素
            '[class*="btn"]', '[class*="button"]', // 可能的按钮类
            '[class*="link"]', '[class*="icon"]', // 链接和图标类
            '[tabindex]:not([tabindex="-1"])', // 有标签索引的元素
            '[data-testid]', '[data-id]', // 带有数据测试ID的元素
            'img[alt]', 'img[title]', // 有alt或title的图片
            '.social-icon', '.share-icon', '.download-icon', '.menu-icon', // 常见的图标类名
            'nav a', '.navigation a', '.menu a', // 导航中的链接
          ];
          
          // 查找所有符合选择器的元素
          let potentialElements = [];
          for (const selector of interactiveSelectors) {
            try {
              const elements = document.querySelectorAll(selector);
              potentialElements = potentialElements.concat(Array.from(elements));
            } catch (e) {
              console.error(`选择器 "${selector}" 查询出错:`, e);
            }
          }
          
          // 去重
          potentialElements = Array.from(new Set(potentialElements));
          
          // 按照视觉顺序排序（从上到下，从左到右）
          potentialElements.sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            // 如果垂直位置相差不大，则按水平位置排序
            if (Math.abs(rectA.top - rectB.top) < 30) {
              return rectA.left - rectB.left;
            }
            return rectA.top - rectB.top;
          });
          
          // 获取元素信息
          let elements = [];
          potentialElements.forEach((element, index) => {
            const info = getElementInfo(element, index);
            if (info) {
              elements.push(info);
            }
          });
          
          // 优先保留特殊元素（按钮、链接和小图标）
          elements.sort((a, b) => {
            // 小型可点击元素优先
            if (a.isSmallClickable && !b.isSmallClickable) return -1;
            if (!a.isSmallClickable && b.isSmallClickable) return 1;
            
            // 按钮和链接优先
            const aIsPriority = a.tagName === 'a' || a.tagName === 'button';
            const bIsPriority = b.tagName === 'a' || b.tagName === 'button';
            if (aIsPriority && !bIsPriority) return -1;
            if (!aIsPriority && bIsPriority) return 1;
            
            // 默认按位置排序
            return 0;
          });
          
          // 如果元素太多，限制数量
          if (elements.length > 150) {
            elements = elements.slice(0, 150);
          }
          
          // 重新分配ID
          elements.forEach((el, index) => {
            el.id = index;
          });
          
          console.log(`找到 ${elements.length} 个元素（从 ${potentialElements.length} 个候选元素）`);
          
          return elements;
        } catch (e) {
          console.error('页面元素检测脚本出错:', e);
          return [];
        }
      });
      
      console.log(`[BrowserController] 发现 ${elements.length} 个页面元素`);
      return elements;
    } catch (error) {
      console.error('[BrowserController] 获取页面元素时出错:', error);
      return [];
    }
  }

  /**
   * 获取所有打开的标签页
   * @returns {Promise<Array>} 标签页数组，包含URL和标题信息
   */
  async getPages() {
    if (!this.browser) {
      logger.error('浏览器未连接');
      throw new Error('浏览器未连接');
    }
    
    try {
      const pages = await this.browser.pages();
      const pagesInfo = await Promise.all(pages.map(async (page, index) => {
        try {
          return {
            id: index,
            url: await page.url(),
            title: await page.title()
          };
        } catch (error) {
          return {
            id: index,
            url: '无法获取URL',
            title: '无法获取标题',
            error: error.message
          };
        }
      }));
      
      logger.info(`获取到 ${pagesInfo.length} 个标签页`);
      return pagesInfo;
    } catch (error) {
      logger.error(`获取标签页失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 切换到指定的标签页
   * @param {number} pageIndex 标签页索引
   * @returns {Promise<boolean>} 切换是否成功
   */
  async switchToPage(pageIndex) {
    if (!this.browser) {
      logger.error('浏览器未连接');
      throw new Error('浏览器未连接');
    }
    
    try {
      const pages = await this.browser.pages();
      
      if (pages.length === 0) {
        logger.error('没有找到任何标签页');
        throw new Error('没有找到任何标签页');
      }
      
      if (pageIndex < 0 || pageIndex >= pages.length) {
        logger.error(`标签页索引越界: ${pageIndex}，有效范围: 0-${pages.length - 1}`);
        throw new Error(`标签页索引越界: ${pageIndex}，有效范围: 0-${pages.length - 1}`);
      }
      
      // 切换当前页面
      this.page = pages[pageIndex];
      
      // 确保标签页获得焦点
      try {
        await this.page.bringToFront();
        logger.info(`已切换到标签页 ${pageIndex}: ${await this.page.url()}`);
        return true;
      } catch (focusError) {
        logger.warn(`无法将标签页 ${pageIndex} 置于前台: ${focusError.message}`);
        // 虽然无法置于前台，但仍然切换了页面对象
        return true;
      }
    } catch (error) {
      logger.error(`切换标签页失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 查找并切换到包含特定URL的标签页
   * @param {string} urlPattern URL模式（部分匹配）
   * @returns {Promise<boolean>} 是否找到并切换成功
   */
  async switchToTabWithUrl(urlPattern) {
    if (!this.browser) {
      logger.error('浏览器未连接');
      throw new Error('浏览器未连接');
    }
    
    try {
      const pages = await this.browser.pages();
      
      for (let i = 0; i < pages.length; i++) {
        const url = await pages[i].url();
        if (url.includes(urlPattern)) {
          // 找到匹配的标签页
          this.page = pages[i];
          await this.page.bringToFront();
          logger.info(`已切换到包含URL "${urlPattern}" 的标签页: ${url}`);
          return true;
        }
      }
      
      logger.warn(`未找到包含URL "${urlPattern}" 的标签页`);
      return false;
    } catch (error) {
      logger.error(`查找标签页失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取当前活跃标签页
   * @returns {Promise<Object>} 当前活跃标签页信息
   */
  async getActiveTab() {
    if (!this.browser) {
      logger.error('浏览器未连接');
      throw new Error('浏览器未连接');
    }
    
    try {
      // 尝试查找当前活跃的标签
      const pages = await this.browser.pages();
      let activePage = null;
      
      // 通过evaluate检查每个页面是否处于活跃状态
      for (const page of pages) {
        try {
          // 尝试执行一个快速命令来检查页面是否活跃
          const isActive = await page.evaluate(() => {
            return document.visibilityState === 'visible' || document.hasFocus();
          }).catch(() => false);
          
          if (isActive) {
            activePage = page;
            break;
          }
        } catch (e) {
          // 忽略单个页面的错误，继续检查其他页面
          continue;
        }
      }
      
      // 如果找不到活跃标签，使用当前标签
      if (!activePage && this.page) {
        activePage = this.page;
      } else if (!activePage && pages.length > 0) {
        // 如果当前标签也不可用，使用第一个标签
        activePage = pages[0];
      }
      
      if (activePage) {
        // 更新当前页面
        this.page = activePage;
        
        return {
          url: await activePage.url(),
          title: await activePage.title()
        };
      } else {
        logger.warn('未找到任何标签页');
        throw new Error('未找到任何标签页');
      }
    } catch (error) {
      logger.error(`获取活跃标签页失败: ${error.message}`);
      throw error;
    }
  }
}

module.exports = BrowserController;
