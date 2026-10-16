#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pc_frame_receiver.py — RK3568 摄像头帧接收测试工具（纯标准库，Windows 直接跑）

用途：
  在你的电脑上先跑这个脚本，验证 RK3568 的 rk_camera 能不能把摄像头画面
  通过网络发过来。收到的 JPEG 会存到脚本同目录的 received_frames/ 里。

用法：
  python pc_frame_receiver.py

验证通过后：
  联调 YOLO 后端时，把 rk_camera.c 顶部的 POST_PORT / POST_PATH 改成
  后端实际的图片接收接口（Java 端 MultipartFile 接收地址）即可。

注意：
  第一次运行 Windows 防火墙会弹窗，点“允许访问”（Python 监听 8080 端口）。
"""
import os
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

SAVE_DIR    = os.path.join(os.path.dirname(os.path.abspath(__file__)), "received_frames")
LISTEN_PORT = 8080

os.makedirs(SAVE_DIR, exist_ok=True)


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(n)

        # multipart 体里抠出 JPEG：起始 FFD8，结束 FFD9
        s = body.find(b"\xff\xd8")
        e = body.rfind(b"\xff\xd9")
        if s >= 0 and e > s:
            jpg = body[s:e + 2]
            fn = os.path.join(
                SAVE_DIR,
                "frame_%s_%03d.jpg" % (time.strftime("%Y%m%d_%H%M%S"),
                                       int((time.time() % 1) * 1000))
            )
            with open(fn, "wb") as f:
                f.write(jpg)
            print("[recv] %s  (%d 字节)" % (fn, len(jpg)))
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"OK")
        else:
            print("[recv] 收到 %d 字节但没找到 JPEG 标记(FFD8/FFD9)" % n)
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"NO JPEG")

    def log_message(self, *args):
        pass  # 静默默认访问日志，只保留 [recv] 行


if __name__ == "__main__":
    print("=" * 60)
    print(" 摄像头帧接收服务已启动: 0.0.0.0:%d" % LISTEN_PORT)
    print(" 图片保存目录: %s" % SAVE_DIR)
    print(" 等 RK3568 那边运行 /data/rk_camera，这里会逐张打印...")
    print(" （防火墙弹窗请点“允许访问”）")
    print("=" * 60)
    HTTPServer(("0.0.0.0", LISTEN_PORT), Handler).serve_forever()
