import argparse
import os
import sys
import logging

logger = logging.getLogger(__name__)

def convert_pt_to_onnx(pt_path, onnx_path, img_size=640, batch_size=1):
    try:
        from ultralytics import YOLO
        model = YOLO(pt_path)
        model.export(
            format='onnx',
            imgsz=img_size,
            batch=batch_size,
            opset=12,
            simplify=True
        )
        
        expected_onnx = pt_path.replace('.pt', '.onnx')
        if os.path.exists(expected_onnx):
            if onnx_path != expected_onnx:
                os.rename(expected_onnx, onnx_path)
            logger.info(f'ONNX model exported successfully: {onnx_path}')
            return True
        else:
            logger.error('ONNX file not generated')
            return False
    except ImportError:
        logger.error('ultralytics module not found')
        return False

def convert_onnx_to_rknn(onnx_path, rknn_path, platform='rk3568', 
                         quantize=True, calib_list_path=None):
    try:
        from rknn.api import RKNN
        
        rknn = RKNN(verbose=False)
        
        logger.info('Configuring RKNN model...')
        rknn.config(
            mean_values=[[0, 0, 0]],
            std_values=[[255, 255, 255]],
            target_platform=platform,
            optimization_level=3,
            quantized_dtype='asymmetric_quantized-u8'
        )
        
        logger.info(f'Loading ONNX model: {onnx_path}')
        ret = rknn.load_onnx(model=onnx_path)
        if ret != 0:
            logger.error(f'Failed to load ONNX model (ret={ret})')
            return False
        
        logger.info('Building RKNN model...')
        if quantize and calib_list_path and os.path.exists(calib_list_path):
            ret = rknn.build(
                do_quantization=True,
                dataset=calib_list_path,
                pre_compile=True
            )
        else:
            ret = rknn.build(
                do_quantization=False,
                pre_compile=True
            )
        
        if ret != 0:
            logger.error(f'Failed to build RKNN model (ret={ret})')
            return False
        
        logger.info(f'Exporting RKNN model to: {rknn_path}')
        ret = rknn.export_rknn(rknn_path)
        if ret != 0:
            logger.error(f'Failed to export RKNN model (ret={ret})')
            return False
        
        logger.info('RKNN model exported successfully!')
        rknn.release()
        return True
        
    except ImportError:
        logger.error('rknn-toolkit2 not installed')
        logger.error('Install: pip install rknn-toolkit2')
        return False
    except Exception as e:
        logger.error(f'Error during RKNN conversion: {e}')
        return False

def main():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[logging.StreamHandler()]
    )
    
    parser = argparse.ArgumentParser(description='Model Conversion: YOLOv5n.pt -> ONNX -> RKNN')
    parser.add_argument('--pt-path', type=str, required=True, help='path to YOLOv5n.pt')
    parser.add_argument('--onnx-path', type=str, default=None, help='output ONNX path')
    parser.add_argument('--rknn-path', type=str, default=None, help='output RKNN path')
    parser.add_argument('--img-size', type=int, default=640, help='input image size')
    parser.add_argument('--batch-size', type=int, default=1, help='batch size')
    parser.add_argument('--platform', type=str, default='rk3568', help='target platform')
    parser.add_argument('--quantize', action='store_true', default=True, help='enable INT8 quantization')
    parser.add_argument('--calib-list', type=str, default=None, help='path to calibration list txt file')
    args = parser.parse_args()

    if args.onnx_path is None:
        args.onnx_path = args.pt_path.replace('.pt', '.onnx')
    
    if args.rknn_path is None:
        args.rknn_path = args.pt_path.replace('.pt', '.rknn')

    logger.info('=' * 50)
    logger.info('Step 1: Converting PyTorch model to ONNX...')
    logger.info('=' * 50)
    pt_success = convert_pt_to_onnx(args.pt_path, args.onnx_path, args.img_size, args.batch_size)
    
    if pt_success and args.rknn_path:
        logger.info('\n' + '=' * 50)
        logger.info('Step 2: Converting ONNX model to RKNN...')
        logger.info('=' * 50)
        rknn_success = convert_onnx_to_rknn(
            args.onnx_path, 
            args.rknn_path, 
            args.platform, 
            args.quantize, 
            args.calib_list
        )
        
        if rknn_success:
            logger.info('\n' + '=' * 50)
            logger.info('Model conversion completed successfully!')
            logger.info('=' * 50)
        else:
            logger.error('RKNN conversion failed')
    elif not pt_success:
        logger.error('ONNX conversion failed')

if __name__ == '__main__':
    main()