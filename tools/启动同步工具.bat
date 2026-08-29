@echo off
chcp 65001 >nul
cd /d %~dp0
echo ============================================
echo   公益站同步助手 - 保持此窗口开启
echo   网页私人视图里点「检测 New API 渠道」即可
echo ============================================
python sync_server.py
pause
