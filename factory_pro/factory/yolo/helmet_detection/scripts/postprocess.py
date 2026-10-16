import numpy as np
import logging

logger = logging.getLogger(__name__)

def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))

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

def nms(boxes, scores, iou_threshold=0.45):
    if len(boxes) == 0:
        return []
    
    indices = np.argsort(scores)[::-1]
    keep = []
    
    while len(indices) > 0:
        idx = indices[0]
        keep.append(idx)
        
        if len(indices) == 1:
            break
        
        current_box = boxes[idx]
        rest_indices = indices[1:]
        rest_boxes = boxes[rest_indices]
        
        iou_scores = np.array([iou(current_box, box) for box in rest_boxes])
        mask = iou_scores < iou_threshold
        
        indices = rest_indices[mask]
    
    return keep

def decode_yolo_output(output, input_size=640, num_classes=3, conf_threshold=0.25):
    detections = []
    
    if isinstance(output, list):
        output = output[0]
    
    output = np.squeeze(output)
    
    if output.dtype != np.float32:
        logger.debug(f'Converting output dtype from {output.dtype} to float32')
        output = output.astype(np.float32)
    
    if len(output.shape) == 2:
        num_detections = output.shape[0]
        
        for i in range(num_detections):
            row = output[i]
            
            cx = row[0]
            cy = row[1]
            w = row[2]
            h = row[3]
            
            if w == 0 and h == 0:
                continue
            
            obj_conf = row[4]
            
            if obj_conf < conf_threshold:
                continue
            
            class_probs = row[5:5 + num_classes]
            class_id = np.argmax(class_probs)
            class_conf = class_probs[class_id]
            
            score = obj_conf * class_conf
            
            if score < conf_threshold:
                continue
            
            x_min = cx - w / 2
            y_min = cy - h / 2
            x_max = cx + w / 2
            y_max = cy + h / 2
            
            detections.append({
                'bbox': [x_min, y_min, x_max, y_max],
                'score': float(score),
                'class_id': int(class_id)
            })
    else:
        stride = [8, 16, 32]
        anchors = [[10, 13], [16, 30], [33, 23], [30, 61], [62, 45], [59, 119], [116, 90], [156, 198], [373, 326]]
        
        for i, s in enumerate(stride):
            grid_size = input_size // s
            out = output[i].reshape(1, len(anchors) // 3, grid_size, grid_size, num_classes + 5)
            out = out.squeeze(0)
            
            if out.dtype != np.float32:
                out = out.astype(np.float32)
            
            for anchor_idx in range(len(anchors) // 3):
                anchor = anchors[anchor_idx + i * 3]
                for y in range(grid_size):
                    for x in range(grid_size):
                        data = out[anchor_idx, y, x]
                        conf = sigmoid(data[4])
                        if conf < conf_threshold:
                            continue
                        
                        class_probs = sigmoid(data[5:])
                        class_id = np.argmax(class_probs)
                        class_conf = class_probs[class_id]
                        score = conf * class_conf
                        
                        if score < conf_threshold:
                            continue
                        
                        cx = (sigmoid(data[0]) + x) * s
                        cy = (sigmoid(data[1]) + y) * s
                        w = np.exp(data[2]) * anchor[0]
                        h = np.exp(data[3]) * anchor[1]
                        
                        x_min = cx - w / 2
                        y_min = cy - h / 2
                        x_max = cx + w / 2
                        y_max = cy + h / 2
                        
                        detections.append({
                            'bbox': [x_min, y_min, x_max, y_max],
                            'score': float(score),
                            'class_id': int(class_id)
                        })
    
    logger.debug(f'Decoded {len(detections)} detections')
    return detections

def restore_coordinates(bbox, input_size=640, original_size=None, scale=1.0, padding=(0, 0)):
    x_min, y_min, x_max, y_max = bbox
    
    x_min = (x_min - padding[0]) / scale
    y_min = (y_min - padding[1]) / scale
    x_max = (x_max - padding[0]) / scale
    y_max = (y_max - padding[1]) / scale
    
    if original_size is not None:
        orig_w, orig_h = original_size
        x_min = max(0, min(x_min, orig_w))
        y_min = max(0, min(y_min, orig_h))
        x_max = max(0, min(x_max, orig_w))
        y_max = max(0, min(y_max, orig_h))
    
    return [x_min, y_min, x_max, y_max]

def postprocess(output, input_size=640, original_size=None, scale=1.0, padding=(0, 0), 
                conf_threshold=0.25, iou_threshold=0.45, num_classes=3):
    detections = decode_yolo_output(output, input_size, num_classes, conf_threshold)
    
    if len(detections) == 0:
        return []
    
    boxes = np.array([det['bbox'] for det in detections])
    scores = np.array([det['score'] for det in detections])
    class_ids = np.array([det['class_id'] for det in detections])
    
    keep = nms(boxes, scores, iou_threshold)
    
    results = []
    for idx in keep:
        if scores[idx] < conf_threshold:
            continue
        
        restored_bbox = restore_coordinates(boxes[idx], input_size, original_size, scale, padding)
        
        results.append({
            'bbox': restored_bbox,
            'score': float(scores[idx]),
            'class_id': int(class_ids[idx])
        })
    
    logger.debug(f'Postprocess completed, {len(results)} detections after NMS')
    return results

if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    
    dummy_output = np.random.randn(1, 25200, 8)
    dummy_output[:, :, 4:] = sigmoid(dummy_output[:, :, 4:])
    dummy_output[:, :, 4] = np.random.uniform(0.5, 1.0, (1, 25200))
    
    results = postprocess(dummy_output, original_size=(1280, 720), scale=0.85, padding=(32, 10))
    logger.info(f'Number of detections: {len(results)}')
    for det in results:
        logger.info(f'Class: {det["class_id"]}, Score: {det["score"]:.4f}, BBox: {det["bbox"]}')