@echo off
title FactoryGuard 全服务启动（不含小程序）
rem %~dp0 = 本脚本所在目录（项目根），随项目放任意路径均可运行
set "ROOT=%~dp0"

echo [1/3] 启动 YOLO 推理服务 (8001)...
start "FactoryGuard-YOLO推理服务(8001)" cmd /k "cd /d %ROOT%factory\esp32_camera_web && D:\soft\python\python-3.11.6-amd64\python.exe inference_server.py"

echo [2/3] 启动 Spring Boot 后端 (8000)...
start "FactoryGuard-后端(8000)" cmd /k "cd /d %ROOT%factory\esp32_camera_webackend-java && set JAVA_HOME=D:\soft\jdk\jdk21&& mvn spring-boot:run -Dspring-boot.run.jvmArguments=-Dfile.encoding=UTF-8"

echo [3/3] 启动 Web 前端 (5173)...
start "FactoryGuard-Web前端(5173)" cmd /k "cd /d %ROOT%factorydemo && npm run dev"

echo.
echo ============================================
echo  全部服务已在各自窗口启动（小程序端除外）！
echo  后端与推理服务就绪约需 30 秒（模型加载较慢）
echo.
echo  小程序端请手动启动:
echo    cd mini-program 后执行 npm run dev:alipay
echo    然后用支付宝开发者工具打开 mini-program\dist
echo.
echo  健康检查:
echo    后端   http://localhost:8000/api/health
echo    推理   http://localhost:8001/health
echo    Web    http://localhost:5173
echo.
echo  配置环境差异: 双击 setup_config.bat
echo  关闭全部服务: 双击 stop_all.bat
echo ============================================
pause
