@echo off
title FactoryGuard 启动（推理服务 + Web 前端）
rem ============================================================
rem  相对路径版：本脚本放在项目根目录即可（与 factory 文件夹平级）
rem  启动: YOLO 安全帽检测推理服务(8001) + Web 前端(5173)
rem  后端(8000) 请手动启动，见结尾提示
rem ============================================================
setlocal enabledelayedexpansion
set "ROOT=%~dp0"

rem ---- 探测 Python（需为带 ultralytics 的解释器）----
rem 顺序: 0.对方机器的已知路径  1.PATH中的python  2.py启动器  3.常见安装目录扫描
set "PYEXE="
if exist "C:\Users\CJTH\AppData\Local\Programs\Python\Python312\python.exe" (
    "C:\Users\CJTH\AppData\Local\Programs\Python\Python312\python.exe" -c "import ultralytics" >nul 2>&1 && set "PYEXE=C:\Users\CJTH\AppData\Local\Programs\Python\Python312\python.exe"
)
if not defined PYEXE (
    python -c "import ultralytics" >nul 2>&1 && set "PYEXE=python"
)
if not defined PYEXE (
    py -3 -c "import ultralytics" >nul 2>&1 && set "PYEXE=py -3"
)
if not defined PYEXE (
    for %%D in (
        "D:\soft\python\python-3.12.0-amd64"
        "D:\soft\python\python-3.11.6-amd64"
        "D:\soft\python\python-3.10.10-amd64"
        "%LOCALAPPDATA%\Programs\Python\Python312"
        "%LOCALAPPDATA%\Programs\Python\Python311"
        "C:\Python312"
        "C:\Python311"
    ) do (
        if not defined PYEXE (
            if exist "%%~D\python.exe" (
                "%%~D\python.exe" -c "import ultralytics" >nul 2>&1 && set "PYEXE=%%~D\python.exe"
            )
        )
    )
)

echo [1/2] 启动 YOLO 推理服务 (8001)...
if defined PYEXE (
    echo       使用 Python: !PYEXE!
    start "FactoryGuard-YOLO推理服务(8001)" cmd /k "cd /d %ROOT%factory\esp32_camera_web && "!PYEXE!" inference_server.py"
) else (
    echo       [警告] 未找到带 ultralytics 的 Python。解决办法二选一：
    echo        1. 安装依赖后重试:  pip install ultralytics opencv-python
    echo        2. 用记事本打开本脚本，把下方 SET PYEXE= 行填上你的 python 完整路径
    echo           例如: set "PYEXE=C:\Python312\python.exe"
    pause
    exit /b 1
)

echo [2/2] 启动 Web 前端 (5173)...
start "FactoryGuard-Web前端(5173)" cmd /k "cd /d %ROOT%factorydemo && npm run dev"

echo.
echo ============================================
echo  服务已在各自窗口启动（后端需要手动启动）！
echo  推理服务首次加载模型约 10~30 秒
echo.
echo  后端(8000)手动启动，新开一个终端执行：
echo    cd %ROOT%factory\esp32_camera_web\backend-java
echo    set JAVA_HOME=D:\soft\jdk\jdk21（中间路径换成你自己的这个是我的）
echo    chcp 65001
echo    mvn spring-boot:run -Dspring-boot.run.jvmArguments=-Dfile.encoding=UTF-8
echo    或者关闭所有服务再使用下面的命令
echo    cd %ROOT%factory\esp32_camera_web\backend-java
echo    mvn spring-boot:run -Dspring-boot.run.jvmArguments=-Dfile.encoding=UTF-8
echo.
echo  健康检查:
echo    推理   http://localhost:8001/health
echo    后端   http://localhost:8000/api/health
echo    Web    http://localhost:5173
echo.
echo  常见问题:
echo   - 检测报"服务不可用": 先确认 8001/8000 健康检查通过
echo   - 8000 被占用: 关掉其他 Python 脚本(如 pc_frame_receiver)
echo     (调试接收脚本请用 8080 端口，勿占 8000/8001)
echo ============================================
pause

rem 如自动探测失败，可取消下行注释并填入你的 python 完整路径
rem set "PYEXE=D:\soft\python\python-3.12.0-amd64\python.exe"
