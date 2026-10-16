@echo off
title FactoryGuard 一键启动（推理服务 + Web 前端）
rem %~dp0 = 本脚本所在目录（项目根），随项目放任意路径均可运行
set "ROOT=%~dp0"

echo ============================================
echo  本脚本启动: YOLO 推理服务 + Web 前端
echo  后端(8000)请运行 start_all02.bat，或手动执行:
echo    cd factory\esp32_camera_webackend-java
echo    mvn spring-boot:run -Dspring-boot.run.jvmArguments=-Dfile.encoding=UTF-8
echo ============================================
echo.

echo [1/2] 启动 YOLO 推理服务 (8001)...
start "FactoryGuard-YOLO推理服务(8001)" cmd /k "cd /d %ROOT%factory\esp32_camera_web && D:\soft\python\python-3.11.6-amd64\python.exe inference_server.py"

echo [2/2] 启动 Web 前端 (5173)...
start "FactoryGuard-Web前端(5173)" cmd /k "cd /d %ROOT%factorydemo && npm run dev"

echo.
echo  就绪检查: 推理 http://localhost:8001/health
echo  关闭全部: 双击 stop_all.bat
pause
