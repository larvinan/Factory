import argparse
import os
import sys

os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'

def main():
    parser = argparse.ArgumentParser(description='Helmet Detection Prediction')
    parser.add_argument('--model', type=str, default='runs/models/helmet_detection-8/weights/best.pt', help='model path')
    parser.add_argument('--source', type=str, default='../datasets/images/val/hard_hat_workers101.jpg', help='image path or directory')
    parser.add_argument('--imgsz', type=int, default=640, help='input size')
    parser.add_argument('--conf', type=float, default=0.346, help='confidence threshold (best mAP at 0.2)')
    parser.add_argument('--iou', type=float, default=0.45, help='IOU threshold (best mAP at 0.6)')
    parser.add_argument('--save', action='store_true', default=True, help='save results')
    parser.add_argument('--show', action='store_true', default=False, help='show results')
    parser.add_argument('--project', type=str, default='runs/predict', help='save project')
    parser.add_argument('--name', type=str, default='exp', help='save name')
    args = parser.parse_args()

    if not os.path.exists(args.model):
        print(f'[ERROR] Model file not found: {args.model}')
        print('[ERROR] Please check the model path')
        sys.exit(1)

    if not os.path.exists(args.source):
        print(f'[ERROR] Source not found: {args.source}')
        print('[ERROR] Please check the source path')
        sys.exit(1)

    try:
        from ultralytics import YOLO
        import warnings
        warnings.filterwarnings('ignore')
        
        print(f'[INFO] Loading model: {args.model}')
        model = YOLO(args.model)
        
        print(f'[INFO] Predicting on: {args.source}')
        print(f'[INFO] Confidence threshold: {args.conf}')
        print(f'[INFO] IOU threshold: {args.iou}')
        
        results = model.predict(
            source=args.source,
            imgsz=args.imgsz,
            conf=args.conf,
            iou=args.iou,
            save=args.save,
            show=args.show,
            project=args.project,
            name=args.name,
            verbose=False
        )
        
        for i, result in enumerate(results):
            boxes = result.boxes
            helmet_count = sum(1 for box in boxes if box.cls == 0)
            no_helmet_count = sum(1 for box in boxes if box.cls == 1)
            print(f'[INFO] Image {i+1}: {helmet_count} helmet, {no_helmet_count} no_helmet')
        
        save_dir = os.path.join(args.project, args.name)
        print(f'[INFO] Prediction completed! Results saved to: {save_dir}')

    except ImportError as e:
        print(f'[ERROR] Import error: {e}')
        print('[ERROR] Please install: pip install ultralytics opencv-python')
        sys.exit(1)
    except Exception as e:
        print(f'[ERROR] Prediction failed: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()