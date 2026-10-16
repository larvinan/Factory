@echo off
title FactoryGuard 一键停止

echo 结束占用 8000 / 8001 / 5173 端口的进程...
for %%p in (8000 8001 5173) do (
    for /f "tokens=5" %%i in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":%%p "') do (
        echo   端口 %%p -^> 结束进程 PID=%%i
        taskkill /PID %%i /F >nul 2>&1
    )
)
echo.
echo 全部服务已停止。
pause
