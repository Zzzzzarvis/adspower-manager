#!/bin/bash
# AdsPower管理器启动脚本

# 检查Node.js是否安装
if ! command -v node &> /dev/null; then
    echo "错误: 未找到Node.js，请先安装Node.js"
    exit 1
fi

# 设置目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

# 检查依赖是否已安装
if [ ! -d "node_modules" ]; then
    echo "正在安装依赖..."
    npm install
fi

# 创建配置目录
mkdir -p config logs recordings

# 启动应用
echo "启动AdsPower管理器..."
node app.js

# 添加错误处理
if [ $? -ne 0 ]; then
    echo "启动失败，请检查错误信息"
    exit 1
fi
