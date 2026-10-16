import argparse
import cv2
import numpy as np
import time
import sys
import os
import yaml
import logging

os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from preprocess import preprocess_image, preprocess_yuyv_frame
from postprocess import postprocess
from zone_detection import detect_zone_violations, load_zones_from_config
from alert_manager import AlertManager
from logging_config import setup_logging

class RKNNInference:
    def __init__(self, model_path, input_size=640):
        self.model_path = model_path
        self.rknn = None
        self.input_size = input_size
        self.output_shapes_logged = False
        self.logger = logging.getLogger(__name__)
    
    def init(self):
        try:
            from rknnlite.api import RKNNLite
            self.rknn = RKNNLite()
            ret = self.rknn.load_rknn(self.model_path)
            if ret != 0:
                self.logger.error(f'Failed to load RKNN model (ret={ret})')
                return False
            
            ret = self.rknn.init_runtime()
            if ret != 0:
                self.logger.error(f'Failed to init runtime (ret={ret})')
                return False
            
            self.logger.info('RKNN model initialized successfully')
            return True
        except ImportError:
            self.logger.warning('rknnlite not found, using CPU fallback')
            return False
    
    def infer(self, input_tensor):
        if self.rknn:
            outputs = self.rknn.inference(inputs=[input_tensor])
            
            if not self.output_shapes_logged:
                self.output_shapes_logged = True
                if outputs is not None:
                    for i, out in enumerate(outputs):
                        self.logger.debug(f'RKNN output {i} shape: {out.shape}, dtype: {out.dtype}')
                        assert len(out.shape) >= 2, f'Unexpected output shape for output {i}: {out.shape}'
            
            return outputs
        else:
            return None

class YOLOInference:
    def __init__(self, model_path, input_size=640):
        self.model_path = model_path
        self.model = None
        self.input_size = input_size
        self.logger = logging.getLogger(__name__)
    
    def init(self):
        try:
            from ultralytics import YOLO
            self.model = YOLO(self.model_path)
            self.logger.info(f'YOLO model initialized: {self.model_path}')
            return True
        except ImportError:
            self.logger.error('ultralytics not found')
            return False
    
    def infer(self, image, conf=0.35, iou=0.45):
        if self.model:
            results = self.model(image, imgsz=self.input_size, conf=conf, iou=iou, verbose=False)
            return results
        else:
            return None

class CameraWatchdog:
    def __init__(self, max_consecutive_failures=10, reconnect_delay=5.0):
        self.max_consecutive_failures = max_consecutive_failures
        self.reconnect_delay = reconnect_delay
        self.consecutive_failures = 0
        self.last_success_time = time.time()
        self.logger = logging.getLogger(__name__)
    
    def record_success(self):
        self.consecutive_failures = 0
        self.last_success_time = time.time()
    
    def record_failure(self):
        self.consecutive_failures += 1
    
    def should_reconnect(self):
        return self.consecutive_failures >= self.max_consecutive_failures
    
    def get_status(self):
        return {
            'consecutive_failures': self.consecutive_failures,
            'max_consecutive_failures': self.max_consecutive_failures,
            'last_success_time': self.last_success_time,
            'uptime': time.time() - self.last_success_time
        }

def draw_results(image, detections, zones, config):
    class_colors = {
        0: (0, 255, 0),   
        1: (0, 0, 255),   
        2: (255, 255, 0)  
    }
    class_names = {
        0: 'Helmet',
        1: 'No Helmet',
        2: 'Forbidden'
    }
    
    for det in detections:
        bbox = det['bbox']
        x_min, y_min, x_max, y_max = [int(c) for c in bbox]
        class_id = det['class_id']
        score = det['score']
        
        color = class_colors.get(class_id, (128, 128, 128))
        label = f'{class_names.get(class_id, "Unknown")} {score:.2f}'
        
        cv2.rectangle(image, (x_min, y_min), (x_max, y_max), color, 2)
        cv2.putText(image, label, (x_min, y_min - 10), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
    
    for zone_name, zone_config in zones.items():
        if isinstance(zone_config, dict):
            polygon = zone_config['coordinates']
            color = zone_config.get('color', [255, 0, 0])
        else:
            polygon = zone_config
            color = [255, 0, 0]
        
        pts = np.array(polygon, np.int32).reshape((-1, 1, 2))
        cv2.polylines(image, [pts], isClosed=True, color=tuple(color), thickness=2)
        cv2.putText(image, zone_name, (polygon[0][0], polygon[0][1] - 10), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, tuple(color), 2)
    
    return image

def load_config(config_path):
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
        return config
    except Exception as e:
        logging.error(f'Failed to load config: {e}')
        return None

def connect_camera(config, source_override=None):
    cam_config = config.get('camera', {})
    device = source_override if source_override else cam_config.get('device', '/dev/video0')
    
    try:
        source = int(device)
    except ValueError:
        source = device
    
    cap = cv2.VideoCapture(source)
    
    if not cap.isOpened():
        logging.error(f'Cannot open camera: {device}')
        return None
    
    width = cam_config.get('width', 1920)
    height = cam_config.get('height', 1080)
    fps = cam_config.get('fps', 30)
    
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
    cap.set(cv2.CAP_PROP_FPS, fps)
    
    actual_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    actual_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    actual_fps = cap.get(cv2.CAP_PROP_FPS)
    
    logging.info(f'Camera connected: {device}')
    logging.info(f'Resolution: {actual_width}x{actual_height}, FPS: {actual_fps}')
    
    return cap, actual_width, actual_height, actual_fps

def main():
    parser = argparse.ArgumentParser(description='Helmet Detection Inference Pipeline')
    parser.add_argument('--config', type=str, default='../config/settings.yaml', 
                        help='path to config file')
    parser.add_argument('--model', type=str, default=None, help='override model path')
    parser.add_argument('--source', type=str, default=None, help='override camera source')
    parser.add_argument('--display', action='store_true', default=False, help='display results')
    parser.add_argument('--save-video', type=str, default=None, help='output video path')
    parser.add_argument('--debug', action='store_true', default=False, help='enable debug logging')
    parser.add_argument('--conf', type=float, default=None, help='confidence threshold')
    parser.add_argument('--iou', type=float, default=None, help='IOU threshold')
    args = parser.parse_args()
    
    config = load_config(args.config)
    if config is None:
        print('Error: Failed to load config')
        return
    
    log_level = 'DEBUG' if args.debug else config.get('logging', {}).get('level', 'INFO')
    setup_logging(log_level=log_level)
    
    logger = logging.getLogger(__name__)
    logger.info('Starting Helmet Detection System')
    
    model_config = config.get('model', {})
    model_path = args.model if args.model else model_config.get('path', 'runs/models/helmet_detection2/weights/best.pt')
    input_size = model_config.get('input_size', 640)
    conf_threshold = args.conf if args.conf is not None else model_config.get('conf_threshold', 0.346)
    iou_threshold = args.iou if args.iou is not None else model_config.get('iou_threshold', 0.45)
    
    logger.info(f'Model: {model_path}')
    logger.info(f'Confidence threshold: {conf_threshold}')
    logger.info(f'IOU threshold: {iou_threshold}')
    
    zones_config = config.get('zones', {})
    zones = {}
    for zone_name, zone_data in zones_config.items():
        if isinstance(zone_data, dict):
            zones[zone_name] = zone_data
        else:
            zones[zone_name] = {'coordinates': zone_data, 'color': [255, 0, 0], 'alert_level': 'serious'}
    logger.info(f'Loaded {len(zones)} zones')
    
    mqtt_config = config.get('mqtt', {})
    mqtt_enabled = mqtt_config.get('enabled', False)
    if mqtt_enabled:
        alert_mqtt_config = {
            'broker': mqtt_config.get('broker', 'localhost'),
            'port': mqtt_config.get('port', 1883),
            'topic': mqtt_config.get('topic', 'ai_safety/alerts'),
            'username': mqtt_config.get('username', ''),
            'password': mqtt_config.get('password', '')
        }
    else:
        alert_mqtt_config = {}
    
    alert_manager = AlertManager(alert_mqtt_config)
    if mqtt_enabled:
        if alert_manager.connect_mqtt():
            logger.info('MQTT connected')
        else:
            logger.warning('MQTT connection failed, proceeding without MQTT')
    
    model_ext = os.path.splitext(model_path)[1].lower()
    
    if model_ext == '.rknn':
        detector = RKNNInference(model_path, input_size)
    else:
        detector = YOLOInference(model_path, input_size)
    
    if not detector.init():
        logger.error('Failed to initialize detector')
        return
    
    cam_config = config.get('camera', {})
    max_reconnect_attempts = cam_config.get('max_reconnect_attempts', 5)
    reconnect_delay = cam_config.get('reconnect_delay', 5.0)
    watchdog = CameraWatchdog(max_consecutive_failures=10, reconnect_delay=reconnect_delay)
    
    cap = None
    original_width = 0
    original_height = 0
    fps = 30
    
    for attempt in range(max_reconnect_attempts):
        cap, original_width, original_height, fps = connect_camera(config, args.source)
        if cap is not None:
            break
        logger.warning(f'Camera connection attempt {attempt + 1}/{max_reconnect_attempts} failed')
        time.sleep(reconnect_delay)
    
    if cap is None:
        logger.error('Failed to connect to camera after all attempts')
        return
    
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    video_writer = None
    if args.save_video:
        video_writer = cv2.VideoWriter(args.save_video, fourcc, fps, (original_width, original_height))
        logger.info(f'Video saving to: {args.save_video}')
    
    frame_count = 0
    total_time = 0.0
    last_log_time = time.time()
    
    logger.info('Starting inference loop...')
    
    try:
        while True:
            ret, frame = cap.read()
            
            if not ret:
                watchdog.record_failure()
                logger.warning(f'Frame read failed (consecutive failures: {watchdog.consecutive_failures})')
                
                if watchdog.should_reconnect():
                    logger.error('Watchdog triggered, attempting camera reconnect')
                    cap.release()
                    for attempt in range(max_reconnect_attempts):
                        cap, original_width, original_height, fps = connect_camera(config, args.source)
                        if cap is not None:
                            watchdog.record_success()
                            logger.info('Camera reconnected successfully')
                            break
                        time.sleep(reconnect_delay)
                    
                    if cap is None:
                        logger.error('Failed to reconnect camera, exiting')
                        break
                
                time.sleep(0.1)
                continue
            
            watchdog.record_success()
            
            start_time = time.time()
            
            image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            if model_ext == '.rknn':
                input_tensor, scale, padding = preprocess_image(image, detector.input_size)
                
                outputs = detector.infer(input_tensor)
                
                if outputs is None:
                    continue
                
                detections = postprocess(
                    outputs,
                    input_size=detector.input_size,
                    original_size=(original_width, original_height),
                    scale=scale,
                    padding=padding,
                    conf_threshold=conf_threshold,
                    iou_threshold=iou_threshold
                )
            else:
                results = detector.infer(image, conf=conf_threshold, iou=iou_threshold)
                
                if results is None or len(results) == 0:
                    detections = []
                    elapsed_time = time.time() - start_time
                    total_time += elapsed_time
                    frame_count += 1
                    if args.display or args.save_video:
                        if args.display:
                            cv2.imshow('Helmet Detection', frame)
                            if cv2.waitKey(1) & 0xFF == ord('q'):
                                logger.info('User interrupted')
                                break
                        if video_writer:
                            video_writer.write(frame)
                    continue
                
                detections = []
                for result in results:
                    for box in result.boxes:
                        score = float(box.conf[0])
                        if score >= conf_threshold:
                            x1, y1, x2, y2 = box.xyxy[0].tolist()
                            box_area = (x2 - x1) * (y2 - y1)
                            image_area = original_width * original_height
                            area_ratio = box_area / image_area
                            
                            if area_ratio < 0.3:
                                detections.append({
                                    'bbox': [x1, y1, x2, y2],
                                    'score': score,
                                    'class_id': int(box.cls[0])
                                })
            
            elapsed_time = time.time() - start_time
            total_time += elapsed_time
            frame_count += 1
            
            current_time = time.time()
            if current_time - last_log_time >= 5.0:
                avg_fps = frame_count / total_time if total_time > 0 else 0
                helmet_count = sum(1 for d in detections if d['class_id'] == 0)
                no_helmet_count = sum(1 for d in detections if d['class_id'] == 1)
                logger.info(f'FPS: {avg_fps:.2f}, Frame time: {elapsed_time*1000:.2f}ms, '
                           f'Detections: {len(detections)} (Helmet: {helmet_count}, No Helmet: {no_helmet_count})')
                last_log_time = current_time
            
            if args.display or args.save_video:
                frame = draw_results(frame, detections, zones, config)
                
                if args.display:
                    cv2.imshow('Helmet Detection', frame)
                    if cv2.waitKey(1) & 0xFF == ord('q'):
                        logger.info('User interrupted')
                        break
                
                if video_writer:
                    video_writer.write(frame)

    except KeyboardInterrupt:
        logger.info('Interrupted by user')
    finally:
        if cap:
            cap.release()
        if video_writer:
            video_writer.release()
        cv2.destroyAllWindows()
        alert_manager.disconnect_mqtt()
        
        if frame_count > 0:
            avg_fps = frame_count / total_time
            logger.info(f'Final Average FPS: {avg_fps:.2f}')
        
        logger.info('Helmet Detection System stopped')

if __name__ == '__main__':
    main()