import argparse
import os
import sys
import warnings

os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'

def main():
    parser = argparse.ArgumentParser(description='YOLOv5n Helmet Detection Training')
    parser.add_argument('--data', type=str, default='../data/data.yaml', help='path to data.yaml')
    parser.add_argument('--weights', type=str, default='yolov5n.pt', help='initial weights path')
    parser.add_argument('--img-size', type=int, default=640, help='train image size')
    parser.add_argument('--batch-size', type=int, default=16, help='batch size')
    parser.add_argument('--epochs', type=int, default=150, help='number of epochs')
    parser.add_argument('--project', type=str, default='runs/models', help='project name')
    parser.add_argument('--name', type=str, default='helmet_detection', help='experiment name')
    parser.add_argument('--device', type=str, default='0', help='cuda device, i.e. 0 or 0,1,2,3 or cpu')
    parser.add_argument('--workers', type=int, default=0, help='number of workers')
    parser.add_argument('--lr0', type=float, default=0.01, help='initial learning rate')
    parser.add_argument('--lrf', type=float, default=0.01, help='final learning rate')
    parser.add_argument('--momentum', type=float, default=0.937, help='SGD momentum')
    parser.add_argument('--weight-decay', type=float, default=0.0005, help='optimizer weight decay')
    parser.add_argument('--warmup-epochs', type=int, default=3, help='warmup epochs')
    parser.add_argument('--augment', action='store_true', default=True, help='enable augmentation')
    parser.add_argument('--conf', type=float, default=0.35, help='confidence threshold')
    parser.add_argument('--iou', type=float, default=0.45, help='IOU threshold')
    args = parser.parse_args()

    try:
        import torch
        torch.nn.Module.dump_patches = True
        warnings.filterwarnings('ignore')
        
        from ultralytics import YOLO
        model = YOLO(args.weights)
        
        print(f'[INFO] Training with parameters:')
        print(f'        Data: {args.data}')
        print(f'        Weights: {args.weights}')
        print(f'        Image Size: {args.img_size}')
        print(f'        Batch Size: {args.batch_size}')
        print(f'        Epochs: {args.epochs}')
        print(f'        Device: {args.device}')
        print(f'        Augmentation: Enabled')
        
        model.train(
            data=args.data,
            imgsz=args.img_size,
            batch=args.batch_size,
            epochs=args.epochs,
            project=args.project,
            name=args.name,
            device=args.device,
            workers=args.workers,
            lr0=args.lr0,
            lrf=args.lrf,
            momentum=args.momentum,
            weight_decay=args.weight_decay,
            warmup_epochs=args.warmup_epochs,
            augment=True,
            hsv_h=0.015,
            hsv_s=0.7,
            hsv_v=0.4,
            degrees=10.0,
            translate=0.1,
            scale=0.5,
            shear=2.0,
            perspective=0.0,
            flipud=0.0,
            fliplr=0.5,
            mosaic=1.0,
            mixup=0.1,
            copy_paste=0.1,
            save_period=20
        )
        
        print('\n[INFO] Training completed successfully!')
        print(f'[INFO] Model saved to: {args.project}/{args.name}')
        
        print('\n[INFO] Running validation...')
        results = model.val(conf=args.conf, iou=args.iou)
        print('[INFO] Validation completed!')
        
        print('\n[INFO] Exporting ONNX model...')
        model.export(format='onnx', imgsz=args.img_size, opset=12, simplify=True)
        print('[INFO] ONNX export completed!')
        
    except ImportError as e:
        print(f'[ERROR] Import error: {e}')
        print('[ERROR] Please install dependencies first:')
        print('[ERROR] pip install ultralytics torch opencv-python')
        sys.exit(1)
    except Exception as e:
        print(f'[ERROR] Training failed: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()