from ultralytics import YOLO
import numpy as np

def main():
    model = YOLO('runs/models/helmet_detection-8/weights/best.pt')
    
    best_f1 = 0
    best_conf, best_iou = 0.25, 0.45
    
    print("搜索最佳阈值组合...")
    for conf in np.arange(0.1, 0.8, 0.05):
        for iou in [0.3, 0.4, 0.45, 0.5, 0.6]:
            results = model.val(
                data='../data/data.yaml',
                conf=round(conf, 2),
                iou=iou,
                workers=0,
                verbose=False
            )
            # 取均值
            p = float(results.box.p.mean())
            r = float(results.box.r.mean())
            f1 = 2 * p * r / (p + r + 1e-6)
            mAP50 = float(results.box.map50)
            
            if f1 > best_f1:
                best_f1 = f1
                best_conf, best_iou = conf, iou
                print(f"  更新最佳: conf={conf:.2f}, iou={iou}, F1={f1:.4f}, mAP50={mAP50:.4f}, P={p:.4f}, R={r:.4f}")
    
    print(f"\n最佳配置: conf={best_conf:.2f}, iou={best_iou}")
    print(f"最佳F1: {best_f1:.4f}")

if __name__ == '__main__':
    main()