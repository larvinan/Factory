import os
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'

from ultralytics import YOLO

def main():
    model = YOLO(r"E:\竞赛\揭榜挂帅擂台赛\安全帽识别\scripts\runs\models\helmet_detection2\weights\best.pt")

    configs = [
        {"conf": 0.346, "iou": 0.45, "name": "F1最优"},
        {"conf": 0.5, "iou": 0.45, "name": "平衡模式"},
        {"conf": 0.7, "iou": 0.3, "name": "高精度模式"},
        {"conf": 0.2, "iou": 0.6, "name": "高召回模式"},
    ]

    for cfg in configs:
        results = model.val(
            data=r"E:\竞赛\揭榜挂帅擂台赛\安全帽识别\data\data.yaml",
            conf=cfg["conf"],
            iou=cfg["iou"],
            imgsz=640,
            verbose=False,
            workers=0,
            batch=8
        )
        print(f"\n【{cfg['name']}】conf={cfg['conf']}, iou={cfg['iou']}")
        print(f"  mAP@50: {results.box.map50:.4f}")
        print(f"  mAP@50-95: {results.box.map:.4f}")
        print(f"  Precision: {results.box.p.mean():.4f}")
        print(f"  Recall: {results.box.r.mean():.4f}")

if __name__ == '__main__':
    main()