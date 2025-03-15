/**
 * 元素探索器 - 用于检查和操作浏览器元素
 */
const ElementExplorer = (function() {
  // 私有变量
  let currentEnvId = null;
  let currentElements = [];
  let selectedElement = null;
  let isVisible = false;
  let screenshotUrl = null;
  
  // DOM元素缓存
  const DOM = {
    panel: null,
    screenshot: null,
    screenshotLoading: null,
    elementsList: null,
    elementCount: null,
    elementDetails: null,
    elementActions: null,
    pageUrl: null,
    envId: null,
    searchInput: null,
    elementHighlights: null,
  };

  // 初始化DOM引用
  function initDomReferences() {
    DOM.panel = document.getElementById('element-explorer-panel');
    DOM.screenshot = document.getElementById('page-screenshot');
    DOM.screenshotLoading = document.getElementById('screenshot-loading');
    DOM.elementsList = document.getElementById('elements-list');
    DOM.elementCount = document.getElementById('element-count');
    DOM.elementDetails = document.getElementById('element-details');
    DOM.elementActions = document.getElementById('element-actions');
    DOM.pageUrl = document.getElementById('page-url');
    DOM.envId = document.getElementById('explorer-env-id');
    DOM.searchInput = document.getElementById('element-search');
    DOM.elementHighlights = document.getElementById('element-highlights');
    
    // 搜索按钮
    document.getElementById('search-button').addEventListener('click', () => {
      searchElements(DOM.searchInput.value);
    });
    
    // 搜索输入回车键
    DOM.searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        searchElements(DOM.searchInput.value);
      }
    });
    
    // 刷新截图按钮
    document.getElementById('refresh-screenshot').addEventListener('click', () => {
      if (currentEnvId) {
        captureScreenshot(currentEnvId);
      }
    });
    
    // 点击元素按钮
    document.getElementById('click-element').addEventListener('click', () => {
      if (selectedElement && selectedElement.selector) {
        clickElement(selectedElement.selector);
      }
    });
    
    // 输入文本按钮
    document.getElementById('type-text').addEventListener('click', () => {
      if (selectedElement && selectedElement.selector) {
        const text = document.getElementById('input-text').value;
        if (text) {
          typeText(selectedElement.selector, text);
        } else {
          alert('请输入要输入的文本');
        }
      }
    });
  }
  
  // 监听DOM加载完成
  document.addEventListener('DOMContentLoaded', () => {
    initDomReferences();
  });
  
  /**
   * 切换元素探索器的可见性
   * @param {boolean} visible 是否可见
   * @param {string} envId 环境ID
   */
  function toggleElementExplorer(visible, envId) {
    if (!DOM.panel) initDomReferences();
    
    isVisible = visible;
    
    if (visible) {
      DOM.panel.style.display = 'block';
      
      if (envId) {
        currentEnvId = envId;
        DOM.envId.textContent = envId;
        
        // 加载环境截图和页面信息
        captureScreenshot(envId);
        loadPageInfo(envId);
      }
    } else {
      DOM.panel.style.display = 'none';
      
      // 清理资源
      if (screenshotUrl) {
        URL.revokeObjectURL(screenshotUrl);
        screenshotUrl = null;
      }
    }
  }
  
  /**
   * 捕获当前页面截图
   * @param {string} envId 环境ID
   */
  async function captureScreenshot(envId) {
    try {
      DOM.screenshotLoading.style.display = 'flex';
      DOM.screenshot.style.opacity = '0.3';
      DOM.elementHighlights.innerHTML = '';
      
      const response = await fetch(`/api/environments/${envId}/screenshot`);
      
      if (!response.ok) {
        throw new Error(`截图失败: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.data) {
        // 释放旧的截图URL
        if (screenshotUrl) {
          URL.revokeObjectURL(screenshotUrl);
        }
        
        // 创建新的截图
        const binaryString = atob(data.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'image/png' });
        screenshotUrl = URL.createObjectURL(blob);
        
        DOM.screenshot.src = screenshotUrl;
        DOM.screenshot.style.opacity = '1';
      } else {
        throw new Error(data.message || '截图获取失败');
      }
    } catch (error) {
      console.error('获取截图失败:', error);
      alert(`获取截图失败: ${error.message}`);
    } finally {
      DOM.screenshotLoading.style.display = 'none';
    }
  }
  
  /**
   * 加载页面信息
   * @param {string} envId 环境ID
   */
  async function loadPageInfo(envId) {
    try {
      const response = await fetch(`/api/environments/${envId}/pageinfo`);
      
      if (!response.ok) {
        throw new Error(`获取页面信息失败: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.data) {
        // 更新页面URL
        DOM.pageUrl.textContent = `当前页面: ${data.data.url}`;
      } else {
        throw new Error(data.message || '获取页面信息失败');
      }
    } catch (error) {
      console.error('获取页面信息失败:', error);
      DOM.pageUrl.textContent = '当前页面: 获取失败';
    }
  }
  
  /**
   * 搜索元素
   * @param {string} query 搜索查询
   */
  async function searchElements(query) {
    if (!currentEnvId || !query.trim()) {
      return;
    }
    
    try {
      const response = await fetch(`/api/environments/${currentEnvId}/elements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ selector: query })
      });
      
      if (!response.ok) {
        throw new Error(`搜索元素失败: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.data) {
        // 更新元素列表
        currentElements = data.data;
        updateElementsList();
        
        // 更新元素计数
        DOM.elementCount.textContent = currentElements.length;
        
        // 高亮元素
        highlightElements(currentElements);
      } else {
        throw new Error(data.message || '搜索元素失败');
      }
    } catch (error) {
      console.error('搜索元素失败:', error);
      alert(`搜索元素失败: ${error.message}`);
      
      // 清空元素列表
      DOM.elementsList.innerHTML = '<li class="list-group-item text-danger">搜索失败</li>';
      DOM.elementCount.textContent = '0';
    }
  }
  
  /**
   * 更新元素列表
   */
  function updateElementsList() {
    DOM.elementsList.innerHTML = '';
    
    if (currentElements.length === 0) {
      DOM.elementsList.innerHTML = '<li class="list-group-item text-muted">没有找到元素</li>';
      return;
    }
    
    currentElements.forEach((element, index) => {
      const listItem = document.createElement('li');
      listItem.className = 'list-group-item';
      listItem.style.cursor = 'pointer';
      
      // 元素文本优先显示文本内容，然后是placeholder，最后是元素类型+索引
      const elementText = element.text || element.placeholder || `${element.tagName} ${index + 1}`;
      
      listItem.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
          <div class="text-truncate">${elementText}</div>
          <span class="badge bg-primary rounded-pill">${element.tagName}</span>
        </div>
      `;
      
      // 点击选择元素
      listItem.addEventListener('click', () => {
        selectElement(element, index);
      });
      
      DOM.elementsList.appendChild(listItem);
    });
  }
  
  /**
   * 高亮截图中的元素
   * @param {Array} elements 元素列表
   */
  function highlightElements(elements) {
    DOM.elementHighlights.innerHTML = '';
    
    const screenshotRect = DOM.screenshot.getBoundingClientRect();
    const containerWidth = screenshotRect.width;
    const containerHeight = screenshotRect.height;
    
    elements.forEach((element, index) => {
      if (element.rect) {
        const { x, y, width, height } = element.rect;
        
        // 创建高亮元素
        const highlight = document.createElement('div');
        highlight.className = 'position-absolute';
        highlight.style.border = '2px solid #ff5722';
        highlight.style.backgroundColor = 'rgba(255, 87, 34, 0.1)';
        highlight.style.zIndex = '10';
        highlight.style.pointerEvents = 'none';
        
        // 根据截图尺寸计算位置
        highlight.style.left = `${(x * containerWidth) / 100}px`;
        highlight.style.top = `${(y * containerHeight) / 100}px`;
        highlight.style.width = `${(width * containerWidth) / 100}px`;
        highlight.style.height = `${(height * containerHeight) / 100}px`;
        
        // 添加标签
        const label = document.createElement('div');
        label.className = 'position-absolute top-0 start-0 translate-middle badge rounded-pill bg-primary';
        label.textContent = index + 1;
        label.style.fontSize = '0.7rem';
        
        highlight.appendChild(label);
        DOM.elementHighlights.appendChild(highlight);
      }
    });
  }
  
  /**
   * 选择元素
   * @param {Object} element 元素对象
   * @param {number} index 元素索引
   */
  function selectElement(element, index) {
    selectedElement = element;
    
    // 更新所有列表项样式
    const listItems = DOM.elementsList.querySelectorAll('li');
    listItems.forEach((item, i) => {
      if (i === index) {
        item.classList.add('active', 'bg-light');
      } else {
        item.classList.remove('active', 'bg-light');
      }
    });
    
    // 更新元素详情
    DOM.elementDetails.innerHTML = `
      <div class="mb-2">
        <small class="text-muted">标签:</small>
        <span class="badge bg-secondary">${element.tagName}</span>
      </div>
      
      ${element.id ? `
        <div class="mb-2">
          <small class="text-muted">ID:</small>
          <code>${element.id}</code>
        </div>
      ` : ''}
      
      ${element.classes && element.classes.length ? `
        <div class="mb-2">
          <small class="text-muted">类:</small>
          <div>${element.classes.map(cls => `<span class="badge bg-info text-dark me-1">${cls}</span>`).join('')}</div>
        </div>
      ` : ''}
      
      ${element.attributes && Object.keys(element.attributes).length ? `
        <div class="mb-2">
          <small class="text-muted">属性:</small>
          <div class="mt-1">
            ${Object.entries(element.attributes).map(([key, value]) => 
              `<div><small><strong>${key}:</strong> <code>${value}</code></small></div>`
            ).join('')}
          </div>
        </div>
      ` : ''}
      
      <div class="mb-2">
        <small class="text-muted">选择器:</small>
        <div><code>${element.selector}</code></div>
      </div>
    `;
    
    // 显示操作按钮
    DOM.elementActions.style.display = 'block';
  }
  
  /**
   * 点击元素
   * @param {string} selector 元素选择器
   */
  async function clickElement(selector) {
    if (!currentEnvId || !selector) {
      return;
    }
    
    try {
      const response = await fetch(`/api/environments/${currentEnvId}/click`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ selector })
      });
      
      if (!response.ok) {
        throw new Error(`点击元素失败: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        // 点击成功，重新加载页面信息和截图
        setTimeout(() => {
          captureScreenshot(currentEnvId);
          loadPageInfo(currentEnvId);
        }, 1000);
      } else {
        throw new Error(data.message || '点击元素失败');
      }
    } catch (error) {
      console.error('点击元素失败:', error);
      alert(`点击元素失败: ${error.message}`);
    }
  }
  
  /**
   * 在元素中输入文本
   * @param {string} selector 元素选择器
   * @param {string} text 要输入的文本
   */
  async function typeText(selector, text) {
    if (!currentEnvId || !selector || !text) {
      return;
    }
    
    try {
      const response = await fetch(`/api/environments/${currentEnvId}/type`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ selector, text })
      });
      
      if (!response.ok) {
        throw new Error(`输入文本失败: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        // 输入成功，清空输入框
        document.getElementById('input-text').value = '';
        
        // 重新加载截图
        setTimeout(() => {
          captureScreenshot(currentEnvId);
        }, 500);
      } else {
        throw new Error(data.message || '输入文本失败');
      }
    } catch (error) {
      console.error('输入文本失败:', error);
      alert(`输入文本失败: ${error.message}`);
    }
  }
  
  // 公开API
  return {
    toggleElementExplorer,
    captureScreenshot,
    searchElements
  };
})();
