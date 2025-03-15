// 强制刷新工具
(function() {
  console.log('强制刷新工具已加载');
  
  // 创建并添加强制刷新按钮
  function addRefreshButton() {
    const refreshButton = document.createElement('button');
    refreshButton.style.position = 'fixed';
    refreshButton.style.bottom = '20px';
    refreshButton.style.right = '20px';
    refreshButton.style.zIndex = '9999';
    refreshButton.style.padding = '10px 15px';
    refreshButton.style.backgroundColor = '#4CAF50';
    refreshButton.style.color = 'white';
    refreshButton.style.border = 'none';
    refreshButton.style.borderRadius = '5px';
    refreshButton.style.cursor = 'pointer';
    refreshButton.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    refreshButton.textContent = '强制刷新页面';
    
    refreshButton.addEventListener('click', function() {
      clearCacheAndReload();
    });
    
    document.body.appendChild(refreshButton);
    console.log('强制刷新按钮已添加到页面');
  }
  
  // 清除缓存并重新加载
  function clearCacheAndReload() {
    console.log('正在清除缓存并强制刷新...');
    
    // 清除所有缓存并强制刷新
    if ('caches' in window) {
      caches.keys().then(function(names) {
        for (let name of names) {
          caches.delete(name);
        }
      });
    }
    
    // 添加时间戳参数强制刷新
    const timestamp = new Date().getTime();
    window.location.href = window.location.pathname + 
      (window.location.search ? window.location.search + '&' : '?') + 
      'nocache=' + timestamp;
  }
  
  // 在DOMContentLoaded事件时添加按钮
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addRefreshButton);
  } else {
    // 如果DOMContentLoaded已经触发，则直接添加
    addRefreshButton();
  }
})(); 