// 等待页面加载完成
window.addEventListener('DOMContentLoaded', function() {
  console.log("修复脚本加载");
  
  // 启用AI命令按钮
  var aiButton = document.getElementById('btn-execute-ai-command');
  if (aiButton) {
    console.log("找到AI命令按钮，移除disabled属性");
    aiButton.disabled = false;
    
    aiButton.addEventListener('click', function() {
      console.log("AI命令按钮被点击");
      
      var aiCommand = document.getElementById('ai-command-input').value.trim();
      var selectedEnvId = document.getElementById('selected-env-id').textContent;
      
      if (selectedEnvId === '未选择') {
        alert('请先选择一个环境');
        return;
      }
      
      if (!aiCommand) {
        alert('请输入AI命令');
        return;
      }
      
      // 显示执行中状态
      this.disabled = true;
      this.textContent = '执行中...';
      var button = this;
      
      fetch('/api/environment/execute-ai-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          envId: selectedEnvId,
          command: aiCommand
        })
      })
      .then(function(res) { return res.json(); })
      .then(function(result) {
        // 恢复按钮状态
        button.disabled = false;
        button.textContent = '执行AI命令';
        
        console.log('执行结果:', result);
        alert(result.success ? '命令执行成功' : '执行失败: ' + result.message);
      })
      .catch(function(err) {
        // 恢复按钮状态
        button.disabled = false;
        button.textContent = '执行AI命令';
        
        console.error('执行出错:', err);
        alert('执行出错: ' + err.message);
      });
    });
  } else {
    console.error("未找到AI命令按钮");
  }
  
  // 环境选择功能
  var envItems = document.querySelectorAll('.env-item');
  envItems.forEach(function(item) {
    item.addEventListener('click', function(e) {
      if (e.target.tagName !== 'BUTTON') {
        var envId = this.dataset.id;
        console.log("选择环境:", envId);
        
        // 更新UI
        document.getElementById('selected-env-id').textContent = envId;
        
        // 启用所有按钮
        document.getElementById('btn-execute-command').disabled = false;
        document.getElementById('btn-run-task').disabled = false;
        document.getElementById('btn-save-note').disabled = false;
        document.getElementById('btn-execute-ai-command').disabled = false;
      }
    });
  });
});
