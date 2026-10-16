@echo off
echo ========================================
echo  模拟 ESP32 摄像头图片上报
echo ========================================
echo.
echo 正在发送测试图片...
python -c "import paho.mqtt.client as mqtt; c=mqtt.Client(); c.connect('localhost',1883); img=open('test_frame.jpg','rb').read(); c.publish('fg/esp32-test/camera',img); c.disconnect(); print('sent',len(img),'bytes')"
echo [成功] 发送完毕
echo.
echo 浏览器打开: http://localhost:8000/api/detections
echo.
pause
