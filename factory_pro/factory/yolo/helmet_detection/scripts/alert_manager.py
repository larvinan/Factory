import json
import time
import logging

logger = logging.getLogger(__name__)

class AlertLevel:
    WARNING = 'warning'
    SERIOUS = 'serious'
    EMERGENCY = 'emergency'

class AlertManager:
    def __init__(self, mqtt_config=None, safety_decision_callback=None):
        self.mqtt_config = mqtt_config or {}
        self.safety_decision_callback = safety_decision_callback
        self.mqtt_client = None
        self._init_mqtt()
    
    def _init_mqtt(self):
        if 'broker' in self.mqtt_config:
            try:
                import paho.mqtt.client as mqtt
                self.mqtt_client = mqtt.Client()
                if 'username' in self.mqtt_config and 'password' in self.mqtt_config:
                    self.mqtt_client.username_pw_set(
                        self.mqtt_config['username'],
                        self.mqtt_config['password']
                    )
            except ImportError:
                logger.warning('paho-mqtt not installed, MQTT functionality disabled')
    
    def connect_mqtt(self):
        if self.mqtt_client and 'broker' in self.mqtt_config:
            try:
                self.mqtt_client.connect(
                    self.mqtt_config['broker'],
                    self.mqtt_config.get('port', 1883),
                    keepalive=60
                )
                self.mqtt_client.loop_start()
                logger.info('MQTT connected successfully')
                return True
            except Exception as e:
                logger.error(f'MQTT connection failed: {e}')
                return False
        return False
    
    def disconnect_mqtt(self):
        if self.mqtt_client:
            self.mqtt_client.loop_stop()
            self.mqtt_client.disconnect()
            logger.info('MQTT disconnected')
    
    def generate_alert(self, alert_type, person_id, bbox, location='workshop', image_url=None):
        alert = {
            'type': 'ai_alert',
            'alert_type': alert_type,
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%S'),
            'location': location,
            'person_id': person_id,
            'bbox': [int(coord) for coord in bbox],
            'image_url': image_url
        }
        return alert
    
    def send_mqtt_alert(self, alert):
        if self.mqtt_client and 'topic' in self.mqtt_config:
            try:
                payload = json.dumps(alert)
                self.mqtt_client.publish(self.mqtt_config['topic'], payload)
                logger.info(f'MQTT alert sent: {alert["alert_type"]}')
                return True
            except Exception as e:
                logger.error(f'Failed to send MQTT alert: {e}')
                return False
        return False
    
    def trigger_local_alert(self, alert_level):
        if alert_level == AlertLevel.WARNING:
            logger.warning('[LOCAL ALERT] WARNING: Yellow LED flash, Beep, Voice: "请佩戴安全帽"')
        elif alert_level == AlertLevel.SERIOUS:
            logger.warning('[LOCAL ALERT] SERIOUS: Red LED flash, Beep, Voice: "禁区危险"')
        elif alert_level == AlertLevel.EMERGENCY:
            logger.error('[LOCAL ALERT] EMERGENCY: Red LED flash + Sound, Voice: "紧急：未戴安全帽进入禁区"')
    
    def calculate_risk_score(self, helmet_status, in_zone):
        score = 0
        if helmet_status == 'no_helmet':
            score += 10
        if in_zone:
            score += 20
        return score
    
    def evaluate_alert(self, person_result, zone_violation=False):
        helmet_status = person_result['status']
        in_zone = zone_violation
        
        risk_score = self.calculate_risk_score(helmet_status, in_zone)
        
        if helmet_status == 'no_helmet' and in_zone:
            alert_level = AlertLevel.EMERGENCY
            alert_type = 'no_helmet_and_zone_violation'
        elif in_zone:
            alert_level = AlertLevel.SERIOUS
            alert_type = 'zone_violation'
        elif helmet_status == 'no_helmet':
            alert_level = AlertLevel.WARNING
            alert_type = 'no_helmet'
        else:
            return None
        
        return {
            'alert_level': alert_level,
            'alert_type': alert_type,
            'risk_score': risk_score,
            'helmet_status': helmet_status,
            'in_zone': in_zone,
            'person_bbox': person_result['person_bbox'],
            'person_score': person_result['person_score']
        }
    
    def process_alerts(self, helmet_results, zone_violations):
        all_alerts = []
        zone_violation_boxes = [v['person_bbox'] for v in zone_violations]
        
        for i, person_result in enumerate(helmet_results):
            person_bbox = person_result['person_bbox']
            in_zone = person_bbox in zone_violation_boxes
            
            alert = self.evaluate_alert(person_result, in_zone)
            
            if alert:
                self.trigger_local_alert(alert['alert_level'])
                
                mqtt_alert = self.generate_alert(
                    alert['alert_type'],
                    person_id=i,
                    bbox=person_bbox
                )
                self.send_mqtt_alert(mqtt_alert)
                
                if self.safety_decision_callback:
                    self.safety_decision_callback(alert['risk_score'])
                
                all_alerts.append(alert)
        
        return all_alerts

def safety_decision_example(risk_score):
    logger.info(f'[SAFETY DECISION] Risk score: {risk_score}')
    if risk_score >= 30:
        logger.warning('[SAFETY DECISION] Triggering emergency actions: Sound + Exhaust fan')
    elif risk_score >= 20:
        logger.warning('[SAFETY DECISION] Triggering serious actions: Sound alert')
    elif risk_score >= 10:
        logger.info('[SAFETY DECISION] Triggering warning: LED flash')

if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    
    mqtt_config = {
        'broker': 'localhost',
        'port': 1883,
        'topic': 'ai_safety/alerts',
        'username': 'user',
        'password': 'pass'
    }
    
    alert_manager = AlertManager(mqtt_config, safety_decision_example)
    alert_manager.connect_mqtt()
    
    test_helmet_results = [
        {'status': 'compliant', 'person_bbox': [100, 200, 150, 450], 'person_score': 0.95},
        {'status': 'no_helmet', 'person_bbox': [200, 180, 250, 420], 'person_score': 0.92},
        {'status': 'unknown', 'person_bbox': [300, 220, 350, 480], 'person_score': 0.89},
    ]
    
    test_zone_violations = [
        {'person_bbox': [200, 180, 250, 420], 'person_score': 0.92, 'helmet_status': 'no_helmet', 'zone_name': 'Zone_A'},
    ]
    
    alerts = alert_manager.process_alerts(test_helmet_results, test_zone_violations)
    
    logger.info(f'Total alerts generated: {len(alerts)}')
    for alert in alerts:
        logger.info(f'  Alert Type: {alert["alert_type"]}')
        logger.info(f'  Alert Level: {alert["alert_level"]}')
        logger.info(f'  Risk Score: {alert["risk_score"]}')
    
    alert_manager.disconnect_mqtt()