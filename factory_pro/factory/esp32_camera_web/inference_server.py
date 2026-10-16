"""
FactoryGuard YOLO 推理微服务
独立于 Java 后端运行，只负责：接收图片 → YOLO推理 → 返回检测结果
"""

import sys
import os
import base64

from ultralytics import YOLO
import cv2
import numpy as np
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import datetime

# 加载模型
YOLO_DIR = os.path.join(os.path.dirname(__file__), "..", "yolo", "helmet_detection", "scripts")
MODEL_PATH = os.path.join(YOLO_DIR, "runs", "models", "helmet_detection2", "weights", "best.pt")
MODEL_PATH = os.path.abspath(MODEL_PATH)
print(f"Loading YOLO model: {MODEL_PATH}")
model = YOLO(MODEL_PATH)
print("Model loaded OK")


def draw_annotations(img, persons):
    """在原图上画检测框：绿框=合规戴帽，红框=未戴帽，附置信度标签，返回 JPEG base64"""
    for p in persons:
        if p["status"] == "compliant":
            x1, y1, x2, y2 = p["helmet_bbox"]
            color = (0, 180, 0)
            label = f"HELMET {p['confidence']:.2f}"
        else:
            x1, y1, x2, y2 = p["no_helmet_bbox"]
            color = (0, 0, 230)
            label = f"NO HELMET {p['confidence']:.2f}"
        cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
        # 标签背景
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        ty = y1 - 6 if y1 - 6 - th > 0 else y1 + 2
        cv2.rectangle(img, (x1, ty - th - 4), (x1 + tw + 4, ty + 2), color, -1)
        cv2.putText(img, label, (x1 + 2, ty), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return base64.b64encode(buf).decode("ascii") if ok else None


class InferHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/detect":
            content_length = int(self.headers["Content-Length"])
            jpeg_bytes = self.rfile.read(content_length)

            nparr = np.frombuffer(jpeg_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                self.send_error(400, "Invalid JPEG")
                return

            results = model(img, imgsz=640, conf=0.35, iou=0.45, verbose=False)

            # 直接映射: class 0=helmet, class 1=no_helmet
            persons = []
            if results[0].boxes is not None:
                boxes = results[0].boxes
                for i in range(len(boxes)):
                    bbox = boxes.xyxy[i].tolist()
                    score = float(boxes.conf[i])
                    cls_id = int(boxes.cls[i])
                    if cls_id == 0:
                        persons.append({
                            "status": "compliant",
                            "helmet_bbox": [int(x) for x in bbox],
                            "confidence": round(score, 4)
                        })
                    elif cls_id == 1:
                        persons.append({
                            "status": "no_helmet",
                            "no_helmet_bbox": [int(x) for x in bbox],
                            "confidence": round(score, 4)
                        })

            total = len(persons)
            compliant = sum(1 for p in persons if p["status"] == "compliant")
            no_helmet = sum(1 for p in persons if p["status"] == "no_helmet")

            # 标注图（画框后 JPEG base64），供小程序/Web 直接展示
            annotated_image = draw_annotations(img.copy(), persons)

            result = {
                "status": "ok",
                "persons": persons,
                "summary": {
                    "total_persons": total,
                    "compliant": compliant,
                    "no_helmet": no_helmet,
                    "unknown": 0
                },
                "annotated_image": annotated_image
            }

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))

        elif self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok","service":"yolo-inference"}')

        else:
            self.send_error(404)

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok","service":"yolo-inference"}')
        else:
            self.send_error(404)

    def log_message(self, format, *args):
        print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {args[0]}")

if __name__ == "__main__":
    port = 8001
    server = HTTPServer(("0.0.0.0", port), InferHandler)
    print(f"YOLO inference server running on http://localhost:{port}")
    print(f"  Health: http://localhost:{port}/health")
    print(f"  Detect: POST http://localhost:{port}/detect")
    server.serve_forever()
