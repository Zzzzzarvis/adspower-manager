"""
Browser Use Web UI API 客户端

该模块提供了Browser Use Web UI的Python API客户端，方便与AdsPower进行集成
服务默认地址: http://127.0.0.1:7788/
"""

import os
import json
import requests
from typing import Dict, List, Any, Optional, Union
from gradio_client import Client


class BrowserUseAPI:
    """Browser Use Web UI API端点常量"""
    
    # 更新LLM上下文可见性
    UPDATE_LLM_NUM_CTX_VISIBILITY = "/update_llm_num_ctx_visibility"
    
    # 停止代理
    STOP_AGENT = "/stop_agent"
    
    # 运行自动化任务(带流式输出)
    RUN_WITH_STREAM = "/run_with_stream"
    
    # 运行深度搜索
    RUN_DEEP_SEARCH = "/run_deep_search"
    
    # 停止研究代理
    STOP_RESEARCH_AGENT = "/stop_research_agent"
    
    # 列出录制视频
    LIST_RECORDINGS = "/list_recordings"
    
    # 从配置文件更新UI
    UPDATE_UI_FROM_CONFIG = "/update_ui_from_config"
    
    # 保存当前配置
    SAVE_CURRENT_CONFIG = "/save_current_config"
    
    # 根据提供商获取模型列表
    GET_LLM_MODELS = "/lambda"
    
    # 获取录制路径
    GET_RECORDING_PATH = "/lambda_1"
    
    # 关闭全局浏览器
    CLOSE_GLOBAL_BROWSER = "/close_global_browser"
    
    # 关闭全局浏览器(备用)
    CLOSE_GLOBAL_BROWSER_1 = "/close_global_browser_1"


class BrowserUseClient:
    """
    Browser Use Web UI API客户端
    
    用于与Browser Use Web UI进行交互的Python客户端，封装了常见操作
    """
    
    def __init__(self, base_url: str = "http://127.0.0.1:7788"):
        """
        初始化Browser Use客户端
        
        Args:
            base_url: WebUI服务地址，默认为http://127.0.0.1:7788
        """
        self.base_url = base_url
        self.client = Client(base_url)
    
    def run_task(self, 
                 task: str, 
                 llm_provider: str = "openai",
                 llm_model_name: str = "gpt-4o",
                 use_vision: bool = True,
                 add_infos: str = "",
                 max_steps: int = 100,
                 headless: bool = False,
                 **kwargs) -> Any:
        """
        运行自动化任务
        
        Args:
            task: 任务描述
            llm_provider: LLM提供商，如"openai"或"deepseek"
            llm_model_name: 模型名称
            use_vision: 是否使用视觉功能(对DeepSeek应设为False)
            add_infos: 附加信息
            max_steps: 最大步骤数
            headless: 是否使用无头模式
            **kwargs: 其他参数
        
        Returns:
            任务执行结果
        """
        # 默认参数
        params = {
            "agent_type": "custom",
            "llm_provider": llm_provider,
            "llm_model_name": llm_model_name,
            "llm_num_ctx": 32000,
            "llm_temperature": 1,
            "llm_base_url": "",
            "llm_api_key": "",
            "use_own_browser": True,
            "keep_browser_open": False,
            "headless": headless,
            "disable_security": True,
            "window_w": 1280,
            "window_h": 1100,
            "save_recording_path": "./tmp/record_videos",
            "save_agent_history_path": "./tmp/agent_history",
            "save_trace_path": "./tmp/traces",
            "enable_recording": True,
            "task": task,
            "add_infos": add_infos,
            "max_steps": max_steps,
            "use_vision": use_vision,
            "max_actions_per_step": 10,
            "tool_calling_method": "auto",
            "api_name": BrowserUseAPI.RUN_WITH_STREAM
        }
        
        # 更新自定义参数
        params.update(kwargs)
        
        # 调用API
        return self.client.predict(**params)
    
    def stop_task(self) -> Any:
        """
        停止当前任务
        
        Returns:
            停止结果
        """
        return self.client.predict(api_name=BrowserUseAPI.STOP_AGENT)
    
    def close_browser(self) -> Any:
        """
        关闭浏览器
        
        Returns:
            关闭结果
        """
        return self.client.predict(api_name=BrowserUseAPI.CLOSE_GLOBAL_BROWSER)
    
    def run_deep_search(self, 
                        research_task: str, 
                        llm_provider: str = "openai",
                        llm_model_name: str = "gpt-4o",
                        use_vision: bool = True,
                        **kwargs) -> Any:
        """
        运行深度搜索
        
        Args:
            research_task: 研究任务描述
            llm_provider: LLM提供商
            llm_model_name: 模型名称
            use_vision: 是否使用视觉功能
            **kwargs: 其他参数
        
        Returns:
            搜索结果
        """
        # 默认参数
        params = {
            "research_task": research_task,
            "max_search_iteration_input": 3,
            "max_query_per_iter_input": 1,
            "llm_provider": llm_provider,
            "llm_model_name": llm_model_name,
            "llm_num_ctx": 32000,
            "llm_temperature": 1,
            "llm_base_url": "",
            "llm_api_key": "",
            "use_vision": use_vision,
            "use_own_browser": True,
            "headless": False,
            "api_name": BrowserUseAPI.RUN_DEEP_SEARCH
        }
        
        # 更新自定义参数
        params.update(kwargs)
        
        # 调用API
        return self.client.predict(**params)
    
    def list_recordings(self, save_recording_path: str = "./tmp/record_videos") -> Any:
        """
        列出录制视频
        
        Args:
            save_recording_path: 录制保存路径
        
        Returns:
            录制列表
        """
        return self.client.predict(
            save_recording_path=save_recording_path,
            api_name=BrowserUseAPI.LIST_RECORDINGS
        )


class AdsPowerBrowserUseIntegration:
    """
    AdsPower与Browser Use集成类
    
    提供AdsPower与Browser Use Web UI的集成功能
    """
    
    def __init__(self, adspower_api_url: str = "http://local.adspower.net:50325"):
        """
        初始化集成类
        
        Args:
            adspower_api_url: AdsPower API地址
        """
        self.adspower_api_url = adspower_api_url
        self.browser_use_client = BrowserUseClient()
    
    def run_with_adspower(self, 
                          env_id: str, 
                          task: str, 
                          llm_provider: str = "deepseek",
                          use_vision: bool = False,
                          headless: bool = False) -> Any:
        """
        使用AdsPower环境运行Browser Use任务
        
        Args:
            env_id: AdsPower环境ID
            task: 任务描述
            llm_provider: LLM提供商，默认"deepseek"
            use_vision: 是否使用视觉功能，默认False(对DeepSeek)
            headless: 是否使用无头模式
        
        Returns:
            任务结果
        
        Raises:
            Exception: 任务执行失败时抛出异常
        """
        try:
            # 1. 启动AdsPower浏览器
            start_url = f"{self.adspower_api_url}/api/v1/browser/start?user_id={env_id}"
            response = requests.get(start_url)
            
            if response.status_code != 200:
                raise Exception(f"请求AdsPower API失败: {response.status_code}")
            
            response_data = response.json()
            if response_data.get("code") != 0 or not response_data.get("data", {}).get("ws"):
                raise Exception(f"启动AdsPower浏览器失败: {response_data.get('msg', '未知错误')}")
            
            # 2. 使用Browser Use执行任务
            result = self.browser_use_client.run_task(
                task=task,
                llm_provider=llm_provider,
                use_vision=use_vision,
                headless=headless
            )
            
            # 3. 任务完成后关闭浏览器
            stop_url = f"{self.adspower_api_url}/api/v1/browser/stop?user_id={env_id}"
            requests.get(stop_url)
            
            return result
            
        except Exception as e:
            print(f"执行任务失败: {str(e)}")
            # 确保浏览器被关闭
            try:
                stop_url = f"{self.adspower_api_url}/api/v1/browser/stop?user_id={env_id}"
                requests.get(stop_url)
            except:
                pass
            raise e


# 使用示例
if __name__ == "__main__":
    # 简单使用示例
    client = BrowserUseClient()
    
    # 运行简单任务
    # result = client.run_task(
    #     task="打开百度并搜索'AdsPower'，然后获取第一个搜索结果",
    #     llm_provider="deepseek",
    #     use_vision=False
    # )
    # print(result)
    
    # AdsPower集成示例
    # integration = AdsPowerBrowserUseIntegration()
    # result = integration.run_with_adspower(
    #     env_id="your_env_id",
    #     task="打开百度并搜索'AdsPower'，然后获取第一个搜索结果",
    #     llm_provider="deepseek"
    # )
    # print(result) 