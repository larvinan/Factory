import argparse
import cv2
import numpy as np
import time
import sys
import os
import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from preprocess import preprocess_image
from postprocess import postprocess
from helmet_detection import detect_helmet_compliance
from zone_detection import detect_zone_violations
from logging_config import setup_logging
import logging

def generate_dummy_frame(width=1920, height=1080):
    return np.random.randint(0, 255, (height, width, 3), dtype=np.uint8)

def generate_dummy_inference_output(input_size=640, num_classes=3, num_detections=10):
    output = np.zeros((1, input_size * input_size // 8, num_classes + 5))
    
    person_boxes = [
        [320, 320, 80, 160],
        [450, 280, 70, 140],
        [180, 350, 90, 180],
        [520, 380, 75, 150],
        [120, 280, 60, 120],
    ]
    
    helmet_boxes = [
        [320, 280, 30, 30],
        [450, 240, 25, 25],
        [120, 240, 28, 28],
    ]
    
    no_helmet_boxes = [
        [180, 310, 35, 35],
        [520, 340, 32, 32],
    ]
    
    all_boxes = []
    all_classes = []
    
    for cx, cy, w, h in person_boxes:
        all_boxes.append([cx, cy, w, h])
        all_classes.append(0)
    
    for cx, cy, w, h in helmet_boxes:
        all_boxes.append([cx, cy, w, h])
        all_classes.append(1)
    
    for cx, cy, w, h in no_helmet_boxes:
        all_boxes.append([cx, cy, w, h])
        all_classes.append(2)
    
    for i, (box, class_id) in enumerate(zip(all_boxes, all_classes)):
        if i >= output.shape[1]:
            break
        cx, cy, w, h = box
        output[0, i, 0] = cx
        output[0, i, 1] = cy
        output[0, i, 2] = w
        output[0, i, 3] = h
        output[0, i, 4] = 0.9
        output[0, i, 5 + class_id] = 0.95
    
    def sigmoid(x):
        return 1.0 / (1.0 + np.exp(-x))
    
    output[:, :, 4:] = sigmoid(output[:, :, 4:])
    
    return output

class DummyInference:
    def __init__(self, input_size=640, delay_ms=50):
        self.input_size = input_size
        self.delay_ms = delay_ms
    
    def init(self):
        return True
    
    def infer(self, input_tensor):
        time.sleep(self.delay_ms / 1000.0)
        return generate_dummy_inference_output(self.input_size)

class BenchmarkResult:
    def __init__(self):
        self.times = {
            'preprocess': [],
            'inference': [],
            'postprocess': [],
            'helmet_detection': [],
            'zone_detection': [],
            'total': []
        }
    
    def add_time(self, stage, duration):
        if stage in self.times:
            self.times[stage].append(duration)
    
    def get_stats(self, stage):
        times = self.times.get(stage, [])
        if not times:
            return None
        return {
            'mean': np.mean(times) * 1000,
            'median': np.median(times) * 1000,
            'min': np.min(times) * 1000,
            'max': np.max(times) * 1000,
            'std': np.std(times) * 1000,
            'count': len(times)
        }
    
    def get_fps(self):
        total_times = self.times.get('total', [])
        if not total_times:
            return 0
        return len(total_times) / sum(total_times)

def run_benchmark(config):
    logger = logging.getLogger(__name__)
    
    model_config = config.get('model', {})
    input_size = model_config.get('input_size', 640)
    conf_threshold = model_config.get('conf_threshold', 0.25)
    iou_threshold = model_config.get('iou_threshold', 0.45)
    
    cam_config = config.get('camera', {})
    width = cam_config.get('width', 1920)
    height = cam_config.get('height', 1080)
    
    bench_config = config.get('benchmark', {})
    warmup_iterations = bench_config.get('warmup_iterations', 10)
    measure_iterations = bench_config.get('measure_iterations', 100)
    
    zones = {
        'test_zone': {'coordinates': [(100, 100), (500, 100), (500, 700), (100, 700)]}
    }
    
    detector = DummyInference(input_size=input_size, delay_ms=50)
    if not detector.init():
        logger.error('Failed to initialize detector')
        return None
    
    result = BenchmarkResult()
    
    logger.info(f'Starting benchmark: warmup={warmup_iterations}, measure={measure_iterations}')
    logger.info(f'Input size: {input_size}x{input_size}, Frame size: {width}x{height}')
    
    for iteration in range(warmup_iterations + measure_iterations):
        frame = generate_dummy_frame(width, height)
        
        start_total = time.time()
        
        start = time.time()
        image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        input_tensor, scale, padding = preprocess_image(image, input_size)
        preprocess_time = time.time() - start
        result.add_time('preprocess', preprocess_time)
        
        start = time.time()
        outputs = detector.infer(input_tensor)
        inference_time = time.time() - start
        result.add_time('inference', inference_time)
        
        start = time.time()
        detections = postprocess(
            outputs,
            input_size=input_size,
            original_size=(width, height),
            scale=scale,
            padding=padding,
            conf_threshold=conf_threshold,
            iou_threshold=iou_threshold
        )
        postprocess_time = time.time() - start
        result.add_time('postprocess', postprocess_time)
        
        start = time.time()
        helmet_results = detect_helmet_compliance(detections)
        helmet_time = time.time() - start
        result.add_time('helmet_detection', helmet_time)
        
        start = time.time()
        zone_violations = detect_zone_violations(helmet_results, zones)
        zone_time = time.time() - start
        result.add_time('zone_detection', zone_time)
        
        total_time = time.time() - start_total
        result.add_time('total', total_time)
        
        if iteration < warmup_iterations and iteration % 5 == 0:
            logger.debug(f'Warmup iteration {iteration + 1}/{warmup_iterations}')
        elif iteration >= warmup_iterations:
            current_iter = iteration - warmup_iterations + 1
            if current_iter % 20 == 0:
                fps = result.get_fps()
                logger.info(f'Measure iteration {current_iter}/{measure_iterations}, FPS: {fps:.2f}')
    
    return result

def print_report(result):
    logger = logging.getLogger(__name__)
    
    logger.info('')
    logger.info('=' * 60)
    logger.info('Benchmark Report')
    logger.info('=' * 60)
    
    fps = result.get_fps()
    logger.info(f'Overall FPS: {fps:.2f}')
    logger.info(f'Average Frame Time: {1000/fps:.2f} ms')
    
    stages = [
        ('Preprocessing', 'preprocess'),
        ('Inference', 'inference'),
        ('Postprocessing', 'postprocess'),
        ('Helmet Detection', 'helmet_detection'),
        ('Zone Detection', 'zone_detection'),
        ('Total', 'total')
    ]
    
    logger.info('')
    logger.info('Stage Breakdown (ms):')
    logger.info('-' * 60)
    logger.info(f'{"Stage":<20} {"Mean":>10} {"Median":>10} {"Min":>10} {"Max":>10} {"Std":>10}')
    logger.info('-' * 60)
    
    for stage_name, stage_key in stages:
        stats = result.get_stats(stage_key)
        if stats:
            logger.info(f'{stage_name:<20} {stats["mean"]:>10.2f} {stats["median"]:>10.2f} '
                       f'{stats["min"]:>10.2f} {stats["max"]:>10.2f} {stats["std"]:>10.2f}')
    
    logger.info('-' * 60)
    
    total_stats = result.get_stats('total')
    if total_stats:
        logger.info(f'{"FPS":<20} {fps:>10.2f}')
        logger.info(f'{"Variance":<20} {total_stats["std"]/total_stats["mean"]*100:>9.2f}%')
    
    logger.info('=' * 60)

def main():
    parser = argparse.ArgumentParser(description='Helmet Detection Benchmark')
    parser.add_argument('--config', type=str, default='../config/settings.yaml', 
                        help='path to config file')
    parser.add_argument('--warmup', type=int, default=None, help='warmup iterations')
    parser.add_argument('--iterations', type=int, default=None, help='measure iterations')
    parser.add_argument('--log-level', type=str, default='INFO', help='log level')
    args = parser.parse_args()
    
    try:
        with open(args.config, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
    except Exception as e:
        print(f'Failed to load config: {e}')
        config = {}
    
    if args.warmup is not None:
        config['benchmark'] = config.get('benchmark', {})
        config['benchmark']['warmup_iterations'] = args.warmup
    
    if args.iterations is not None:
        config['benchmark'] = config.get('benchmark', {})
        config['benchmark']['measure_iterations'] = args.iterations
    
    setup_logging(log_level=args.log_level)
    
    result = run_benchmark(config)
    
    if result:
        print_report(result)
    else:
        logging.error('Benchmark failed')

if __name__ == '__main__':
    main()