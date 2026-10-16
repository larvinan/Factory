from ultralytics import YOLO
import json
from datetime import datetime

def main():
    model = YOLO('runs/models/helmet_detection2/weights/best.pt')

    # 验证
    results = model.val(
        data='../data/data.yaml',
        conf=0.346,
        iou=0.45,
        imgsz=640,
        save=True,
        save_json=True,
        workers=0  # Windows下设为0避免多进程问题
    )

    # 打印指标
    print("\n" + "="*50)
    print("验证集完整指标")
    print("="*50)
    print(f"mAP@50:      {results.box.map50:.4f}")
    print(f"mAP@50-95:   {results.box.maps:.4f}")
    print(f"Precision:   {results.box.p:.4f}")
    print(f"Recall:      {results.box.r:.4f}")

    # 各类别AP
    names = results.names
    print(f"\n各类别AP@50:")
    for i, ap in enumerate(results.box.ap50):
        print(f"  {names[i]}: {ap:.4f}")

    # 保存报告
    report = {
        "model": "helmet_detection2",
        "timestamp": datetime.now().isoformat(),
        "metrics": {
            "mAP@50": round(float(results.box.map50), 4),
            "mAP@50-95": round(float(results.box.maps), 4),
            "precision": round(float(results.box.p), 4),
            "recall": round(float(results.box.r), 4),
        }
    }

    with open('val_report.json', 'w') as f:
        json.dump(report, f, indent=2)

    print("\n报告已保存: val_report.json")

if __name__ == '__main__':
    main()