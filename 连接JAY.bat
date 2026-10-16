@echo off
REM ============================================================
REM RK3568 一键连 JAY（Windows 端，双击或在本目录命令行运行）
REM 板子重启后执行一次即可
REM ============================================================
set HDC=D:\嵌入式\kaihongos4.1板卡文档\toolchains-windows-x64-4.1.7.5-Release\toolchains\hdc.exe

echo 正在检查板子连接...
"%HDC%" list targets
if errorlevel 1 (
    echo [错误] 未检测到 RK3568，请检查 USB 线和 hdc 驱动
    pause
    exit /b 1
)

echo.
echo 正在连接 JAY ...
"%HDC%" shell sh /data/connect_jay.sh

echo.
pause
