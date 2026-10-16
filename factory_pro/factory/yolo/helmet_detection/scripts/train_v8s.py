from ultralytics import YOLO

def main():
    model = YOLO('yolov8s.pt')  # 自动下载
    
    results = model.train(
        data='../data/data.yaml',
        epochs=200,
        imgsz=640,
        batch=16,
        
        # 数据增强
        hsv_h=0.015,
        hsv_s=0.7,
        hsv_v=0.4,
        translate=0.1,
        scale=0.5,
        fliplr=0.5,
        mosaic=1.0,
        mixup=0.1,
        copy_paste=0.1,
        
        # 学习率
        lr0=0.01,
        lrf=0.01,
        momentum=0.937,
        weight_decay=0.0005,
        warmup_epochs=3.0,
        
        patience=50,
        save=True,
        device=0,
        workers=0,
        
        project='runs/models',
        name='helmet_v8s'
    )
    
    print(f"\n训练完成！最佳 mAP@50: {results.results_dict.get('metrics/mAP50(B)', 0):.4f}")

if __name__ == '__main__':
    main()