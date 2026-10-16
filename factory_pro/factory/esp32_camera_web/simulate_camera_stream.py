"""
模拟 RK3568 摄像头帧上报
循环向 MQTT fg/esp32-test/camera 推送 JPEG 帧，模拟视频流（每秒 1 帧）
用法：python simulate_camera_stream.py [持续秒数，默认 60]
"""
import sys
import time
import os
import paho.mqtt.client as mqtt

FRAME = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_frame.jpg")
TOPIC = "fg/esp32-test/camera"

def main():
    duration = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    img = open(FRAME, "rb").read()
    c = mqtt.Client()
    c.connect("localhost", 1883)
    c.loop_start()
    print(f"推送 {len(img)} 字节帧到 {TOPIC}，持续 {duration} 秒...")
    start = time.time()
    n = 0
    while time.time() - start < duration:
        c.publish(TOPIC, img, qos=0)
        n += 1
        time.sleep(1)
    c.loop_stop()
    c.disconnect()
    print(f"共推送 {n} 帧")

if __name__ == "__main__":
    main()
