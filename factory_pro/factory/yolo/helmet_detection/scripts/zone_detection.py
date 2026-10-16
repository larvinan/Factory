import logging

logger = logging.getLogger(__name__)

def point_in_polygon(point, polygon):
    x, y = point
    n = len(polygon)
    inside = False
    
    for i in range(n):
        j = (i + 1) % n
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        
        if ((yi > y) != (yj > y)):
            x_intersect = (y - yi) * (xj - xi) / (yj - yi) + xi
            if x < x_intersect:
                inside = not inside
    
    return inside

def get_person_bottom_center(person_bbox):
    x_min, y_min, x_max, y_max = person_bbox
    center_x = (x_min + x_max) / 2
    return (center_x, y_max)

def get_zone_coordinates(zone_data):
    if isinstance(zone_data, dict):
        return zone_data.get('coordinates', [])
    return zone_data

def is_person_in_zone(person_bbox, zones):
    bottom_center = get_person_bottom_center(person_bbox)
    
    for zone_name, zone_data in zones.items():
        polygon = get_zone_coordinates(zone_data)
        if point_in_polygon(bottom_center, polygon):
            return True, zone_name, zone_data
    
    return False, None, None

def detect_zone_violations(person_results, zones):
    violations = []
    
    for person_result in person_results:
        person_bbox = person_result['person_bbox']
        in_zone, zone_name, zone_data = is_person_in_zone(person_bbox, zones)
        
        if in_zone:
            violation = {
                'person_bbox': person_bbox,
                'person_score': person_result['person_score'],
                'helmet_status': person_result['status'],
                'zone_name': zone_name,
                'violation_type': 'zone_violation'
            }
            
            if isinstance(zone_data, dict):
                violation['zone_color'] = zone_data.get('color', [255, 0, 0])
                violation['alert_level'] = zone_data.get('alert_level', 'serious')
            
            violations.append(violation)
    
    return violations

def load_zones_from_config(config_file):
    import yaml
    
    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
        
        zones = {}
        if 'zones' in config:
            for zone_name, zone_data in config['zones'].items():
                zones[zone_name] = zone_data
        
        logger.info(f'Loaded {len(zones)} zones from config')
        return zones
    except Exception as e:
        logger.error(f'Failed to load zones from config: {e}')
        return {}

def save_zones_to_config(zones, config_file):
    import yaml
    
    config = {'zones': zones}
    
    try:
        with open(config_file, 'w', encoding='utf-8') as f:
            yaml.dump(config, f, default_flow_style=False)
        logger.info(f'Saved {len(zones)} zones to config')
    except Exception as e:
        logger.error(f'Failed to save zones to config: {e}')

if __name__ == '__main__':
    test_zones = {
        'Zone_A': {'coordinates': [(100, 100), (300, 100), (300, 400), (100, 400)], 'color': [255, 0, 0]},
        'Zone_B': {'coordinates': [(500, 200), (700, 200), (700, 500), (500, 500)], 'color': [0, 255, 0]}
    }
    
    test_persons = [
        {'person_bbox': [150, 200, 200, 350], 'person_score': 0.95, 'status': 'compliant'},
        {'person_bbox': [250, 150, 300, 300], 'person_score': 0.92, 'status': 'no_helmet'},
        {'person_bbox': [550, 250, 600, 400], 'person_score': 0.89, 'status': 'compliant'},
        {'person_bbox': [750, 300, 800, 450], 'person_score': 0.85, 'status': 'no_helmet'},
    ]
    
    violations = detect_zone_violations(test_persons, test_zones)
    
    logger.info(f'Total zone violations: {len(violations)}')
    for i, violation in enumerate(violations):
        logger.info(f'Violation {i+1}:')
        logger.info(f'  Person BBox: {violation["person_bbox"]}')
        logger.info(f'  Person Score: {violation["person_score"]}')
        logger.info(f'  Helmet Status: {violation["helmet_status"]}')
        logger.info(f'  Zone Name: {violation["zone_name"]}')
        if 'alert_level' in violation:
            logger.info(f'  Alert Level: {violation["alert_level"]}')