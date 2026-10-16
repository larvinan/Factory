import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import cv2

from preprocess import preprocess_image
from postprocess import postprocess, sigmoid
from helmet_detection import detect_helmet_compliance
from zone_detection import detect_zone_violations
from alert_manager import AlertManager

def generate_dummy_inference_output(input_size=640, num_classes=3, num_detections=5):
    output = np.zeros((1, input_size * input_size // 8, num_classes + 5))
    
    person_boxes = [
        [320, 320, 80, 160],
        [450, 280, 70, 140],
        [180, 350, 90, 180],
    ]
    
    helmet_boxes = [
        [320, 280, 30, 30],
        [450, 240, 25, 25],
    ]
    
    no_helmet_boxes = [
        [180, 310, 35, 35],
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
        cx, cy, w, h = box
        row_idx = min(i, output.shape[1] - 1)
        
        output[0, row_idx, 0] = cx
        output[0, row_idx, 1] = cy
        output[0, row_idx, 2] = w
        output[0, row_idx, 3] = h
        output[0, row_idx, 4] = 0.9
        output[0, row_idx, 5 + class_id] = 0.95
    
    output[:, :, 4:] = sigmoid(output[:, :, 4:])
    
    return output

def test_preprocess():
    print('Testing preprocess...')
    dummy_image = np.random.randint(0, 255, (720, 1280, 3), dtype=np.uint8)
    
    tensor, scale, padding = preprocess_image(dummy_image, target_size=640)
    
    assert tensor.shape == (1, 3, 640, 640), f'Expected (1, 3, 640, 640), got {tensor.shape}'
    assert 0 < scale <= 1.0, f'Invalid scale: {scale}'
    assert padding[0] >= 0 and padding[1] >= 0, f'Invalid padding: {padding}'
    
    print(f'  Input shape: {dummy_image.shape}')
    print(f'  Output tensor shape: {tensor.shape}')
    print(f'  Scale: {scale:.4f}')
    print(f'  Padding: {padding}')
    print('  ✓ Preprocess test passed')

def test_postprocess():
    print('Testing postprocess...')
    dummy_output = generate_dummy_inference_output()
    
    print(f'  Input shape: {dummy_output.shape}')
    
    detections = postprocess(
        dummy_output,
        input_size=640,
        original_size=(1280, 720),
        scale=0.5,
        padding=(0, 120)
    )
    
    print(f'  Number of detections: {len(detections)}')
    
    assert len(detections) > 0, 'No detections returned'
    
    for det in detections:
        assert 'bbox' in det, 'Missing bbox'
        assert 'score' in det, 'Missing score'
        assert 'class_id' in det, 'Missing class_id'
        assert 0 <= det['class_id'] <= 2, f'Invalid class_id: {det["class_id"]}'
        print(f'    Class {det["class_id"]}: score={det["score"]:.4f}, bbox={det["bbox"]}')
    
    print('  ✓ Postprocess test passed')

def test_helmet_detection():
    print('Testing helmet detection...')
    test_detections = [
        {'bbox': [100, 200, 150, 450], 'score': 0.95, 'class_id': 0},
        {'bbox': [115, 210, 135, 250], 'score': 0.88, 'class_id': 1},
        {'bbox': [200, 180, 250, 420], 'score': 0.92, 'class_id': 0},
        {'bbox': [215, 185, 235, 225], 'score': 0.75, 'class_id': 2},
        {'bbox': [300, 220, 350, 480], 'score': 0.89, 'class_id': 0},
    ]
    
    results = detect_helmet_compliance(test_detections)
    
    print(f'  Number of persons: {len(results)}')
    
    compliant_count = sum(1 for r in results if r['status'] == 'compliant')
    no_helmet_count = sum(1 for r in results if r['status'] == 'no_helmet')
    unknown_count = sum(1 for r in results if r['status'] == 'unknown')
    
    assert compliant_count == 1, f'Expected 1 compliant, got {compliant_count}'
    assert no_helmet_count == 1, f'Expected 1 no_helmet, got {no_helmet_count}'
    assert unknown_count == 1, f'Expected 1 unknown, got {unknown_count}'
    
    for i, result in enumerate(results):
        print(f'    Person {i+1}: status={result["status"]}, confidence={result["confidence"]:.4f}')
    
    print('  ✓ Helmet detection test passed')

def test_zone_detection():
    print('Testing zone detection...')
    test_zones = {
        'Zone_A': [(100, 100), (300, 100), (300, 400), (100, 400)],
        'Zone_B': [(500, 200), (700, 200), (700, 500), (500, 500)]
    }
    
    test_persons = [
        {'person_bbox': [150, 200, 200, 350], 'person_score': 0.95, 'status': 'compliant'},
        {'person_bbox': [250, 150, 300, 300], 'person_score': 0.92, 'status': 'no_helmet'},
        {'person_bbox': [550, 250, 600, 400], 'person_score': 0.89, 'status': 'compliant'},
        {'person_bbox': [750, 300, 800, 450], 'person_score': 0.85, 'status': 'no_helmet'},
    ]
    
    violations = detect_zone_violations(test_persons, test_zones)
    
    print(f'  Number of violations: {len(violations)}')
    assert len(violations) == 3, f'Expected 3 violations, got {len(violations)}'
    
    for i, violation in enumerate(violations):
        print(f'    Violation {i+1}: zone={violation["zone_name"]}')
    
    print('  ✓ Zone detection test passed')

def test_alert_manager():
    print('Testing alert manager...')
    
    def safety_callback(risk_score):
        print(f'    Safety callback: risk_score={risk_score}')
    
    alert_manager = AlertManager(safety_decision_callback=safety_callback)
    
    test_helmet_results = [
        {'status': 'compliant', 'person_bbox': [100, 200, 150, 450], 'person_score': 0.95},
        {'status': 'no_helmet', 'person_bbox': [200, 180, 250, 420], 'person_score': 0.92},
        {'status': 'unknown', 'person_bbox': [300, 220, 350, 480], 'person_score': 0.89},
    ]
    
    test_zone_violations = [
        {'person_bbox': [200, 180, 250, 420], 'person_score': 0.92, 'helmet_status': 'no_helmet', 'zone_name': 'Zone_A'},
    ]
    
    alerts = alert_manager.process_alerts(test_helmet_results, test_zone_violations)
    
    print(f'  Number of alerts: {len(alerts)}')
    assert len(alerts) == 1, f'Expected 1 alert, got {len(alerts)}'
    
    for alert in alerts:
        print(f'    Alert: type={alert["alert_type"]}, level={alert["alert_level"]}, risk_score={alert["risk_score"]}')
    
    print('  ✓ Alert manager test passed')

def test_full_pipeline():
    print('\n' + '=' * 60)
    print('Running full pipeline test...')
    print('=' * 60)
    
    dummy_image = np.random.randint(0, 255, (720, 1280, 3), dtype=np.uint8)
    print(f'\nStep 1: Preprocess')
    print(f'  Input image: {dummy_image.shape}')
    
    tensor, scale, padding = preprocess_image(dummy_image, target_size=640)
    print(f'  Output tensor: {tensor.shape}')
    
    print('\nStep 2: Inference (dummy output)')
    dummy_output = generate_dummy_inference_output()
    print(f'  Output shape: {dummy_output.shape}')
    
    print('\nStep 3: Postprocess')
    detections = postprocess(
        dummy_output,
        input_size=640,
        original_size=(1280, 720),
        scale=scale,
        padding=padding
    )
    print(f'  Detections: {len(detections)}')
    
    print('\nStep 4: Helmet detection')
    helmet_results = detect_helmet_compliance(detections)
    compliant = sum(1 for r in helmet_results if r['status'] == 'compliant')
    no_helmet = sum(1 for r in helmet_results if r['status'] == 'no_helmet')
    unknown = sum(1 for r in helmet_results if r['status'] == 'unknown')
    print(f'  Compliant: {compliant}, No helmet: {no_helmet}, Unknown: {unknown}')
    
    print('\nStep 5: Zone detection')
    zones = {
        'Zone_A': [(100, 100), (300, 100), (300, 400), (100, 400)]
    }
    zone_violations = detect_zone_violations(helmet_results, zones)
    print(f'  Zone violations: {len(zone_violations)}')
    
    print('\nStep 6: Alert processing')
    alert_manager = AlertManager()
    alerts = alert_manager.process_alerts(helmet_results, zone_violations)
    print(f'  Alerts generated: {len(alerts)}')
    
    print('\n' + '=' * 60)
    print('✓ Full pipeline test passed!')
    print('=' * 60)

def main():
    print('=' * 60)
    print('Helmet Detection Pipeline - Unit Tests')
    print('=' * 60)
    
    try:
        test_preprocess()
        print()
        
        test_postprocess()
        print()
        
        test_helmet_detection()
        print()
        
        test_zone_detection()
        print()
        
        test_alert_manager()
        print()
        
        test_full_pipeline()
        
        print('\n✅ All tests passed!')
        return 0
    except AssertionError as e:
        print(f'\n❌ Test failed: {e}')
        import traceback
        traceback.print_exc()
        return 1
    except Exception as e:
        print(f'\n❌ Unexpected error: {e}')
        import traceback
        traceback.print_exc()
        return 1

if __name__ == '__main__':
    sys.exit(main())