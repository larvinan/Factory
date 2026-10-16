@echo off
echo ========================================
echo  模拟 ESP32 传感器数据上报
echo ========================================
echo.
echo 正在发送测试数据...
mosquitto_pub -t "fg/esp32-test/sensors" -h localhost -f "%~dp0test_sensor.json"
if %errorlevel% equ 0 (
    echo [成功] 发送成功！
    echo.
    echo 浏览器打开: http://localhost:8000/api/sensors/latest
) else (
    echo [失败] 发送失败，请确认 Mosquitto 正在运行
)
echo.
pause
