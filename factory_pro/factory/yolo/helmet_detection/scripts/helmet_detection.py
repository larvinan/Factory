import numpy as np
import logging

logger = logging.getLogger(__name__)

def get_head_region(person_bbox, head_ratio=0.25):
    x_min, y_min, x_max, y_max = person_bbox
    height = y_max - y_min
    head_height = height * head_ratio
    return [x_min, y_min, x_max, y_min + head_height]

def iou(box1, box2):
    x1_min, y1_min, x1_max, y1_max = box1
    x2_min, y2_min, x2_max, y2_max = box2
    
    inter_x_min = max(x1_min, x2_min)
    inter_y_min = max(y1_min, y2_min)
    inter_x_max = min(x1_max, x2_max)
    inter_y_max = min(y1_max, y2_max)
    
    inter_w = max(0, inter_x_max - inter_x_min)
    inter_h = max(0, inter_y_max - inter_y_min)
    inter_area = inter_w * inter_h
    
    area1 = (x1_max - x1_min) * (y1_max - y1_min)
    area2 = (x2_max - x2_min) * (y2_max - y2_min)
    
    union_area = area1 + area2 - inter_area
    if union_area == 0:
        return 0.0
    
    return inter_area / union_area

def get_center(bbox):
    x_min, y_min, x_max, y_max = bbox
    return ((x_min + x_max) / 2, (y_min + y_max) / 2)

def center_distance(center1, center2):
    return np.sqrt((center1[0] - center2[0]) ** 2 + (center1[1] - center2[1]) ** 2)

def match_person_with_helmet(person_bbox, helmet_boxes, no_helmet_boxes, iou_threshold=0.25):
    head_region = get_head_region(person_bbox, head_ratio=0.25)
    
    helmet_match = None
    max_helmet_iou = 0.0
    
    for helmet in helmet_boxes:
        helmet_bbox = helmet['bbox']
        current_iou = iou(head_region, helmet_bbox)
        
        if current_iou > max_helmet_iou:
            max_helmet_iou = current_iou
            helmet_match = helmet
    
    if max_helmet_iou >= iou_threshold:
        logger.debug(f'Person matched with helmet, IoU: {max_helmet_iou:.4f}')
        return {
            'status': 'compliant',
            'person_bbox': person_bbox,
            'helmet_bbox': helmet_match['bbox'],
            'helmet_score': helmet_match['score'],
            'confidence': max_helmet_iou
        }
    
    no_helmet_match = None
    max_no_helmet_iou = 0.0
    
    for no_helmet in no_helmet_boxes:
        no_helmet_bbox = no_helmet['bbox']
        current_iou = iou(head_region, no_helmet_bbox)
        
        if current_iou > max_no_helmet_iou:
            max_no_helmet_iou = current_iou
            no_helmet_match = no_helmet
    
    if max_no_helmet_iou >= iou_threshold:
        logger.debug(f'Person matched with no_helmet, IoU: {max_no_helmet_iou:.4f}')
        return {
            'status': 'no_helmet',
            'person_bbox': person_bbox,
            'no_helmet_bbox': no_helmet_match['bbox'],
            'no_helmet_score': no_helmet_match['score'],
            'confidence': max_no_helmet_iou
        }
    
    logger.debug(f'Person has unknown helmet status')
    return {
        'status': 'unknown',
        'person_bbox': person_bbox,
        'helmet_bbox': None,
        'no_helmet_bbox': None,
        'confidence': 0.0
    }

def detect_helmet_compliance(detections, class_names=['person', 'helmet', 'no_helmet'], iou_threshold=0.25):
    person_boxes = []
    helmet_boxes = []
    no_helmet_boxes = []
    
    for det in detections:
        class_id = det['class_id']
        if class_id == 0:
            person_boxes.append(det)
        elif class_id == 1:
            helmet_boxes.append(det)
        elif class_id == 2:
            no_helmet_boxes.append(det)
    
    logger.debug(f'Detected: {len(person_boxes)} persons, {len(helmet_boxes)} helmets, {len(no_helmet_boxes)} no_helmets')
    
    results = []
    for person in person_boxes:
        person_bbox = person['bbox']
        result = match_person_with_helmet(person_bbox, helmet_boxes, no_helmet_boxes, iou_threshold)
        result['person_score'] = person['score']
        results.append(result)
    
    return results

if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    
    test_detections = [
        {'bbox': [100, 200, 150, 450], 'score': 0.95, 'class_id': 0},
        {'bbox': [115, 210, 135, 250], 'score': 0.88, 'class_id': 1},
        {'bbox': [200, 180, 250, 420], 'score': 0.92, 'class_id': 0},
        {'bbox': [215, 185, 235, 225], 'score': 0.75, 'class_id': 2},
        {'bbox': [300, 220, 350, 480], 'score': 0.89, 'class_id': 0},
    ]
    
    results = detect_helmet_compliance(test_detections)
    
    logger.info(f'Total persons detected: {len(results)}')
    for i, result in enumerate(results):
        logger.info(f'Person {i+1}:')
        logger.info(f'  Status: {result["status"]}')
        logger.info(f'  Person BBox: {result["person_bbox"]}')
        logger.info(f'  Person Score: {result["person_score"]}')
        if result['helmet_bbox']:
            logger.info(f'  Helmet BBox: {result["helmet_bbox"]}')
            logger.info(f'  Helmet Score: {result["helmet_score"]}')
        if result['no_helmet_bbox']:
            logger.info(f'  No Helmet BBox: {result["no_helmet_bbox"]}')
            logger.info(f'  No Helmet Score: {result["no_helmet_score"]}')
        logger.info(f'  Confidence: {result["confidence"]:.4f}')