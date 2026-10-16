import logging
import os
from logging.handlers import RotatingFileHandler

LOG_LEVELS = {
    'DEBUG': logging.DEBUG,
    'INFO': logging.INFO,
    'WARNING': logging.WARNING,
    'ERROR': logging.ERROR,
    'CRITICAL': logging.CRITICAL
}

def setup_logging(log_level='INFO', log_format=None, log_file=None, 
                  max_file_size=10*1024*1024, backup_count=5):
    if log_format is None:
        log_format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    
    level = LOG_LEVELS.get(log_level.upper(), logging.INFO)
    
    logging.basicConfig(
        level=level,
        format=log_format,
        handlers=[
            logging.StreamHandler()
        ]
    )
    
    if log_file:
        log_dir = os.path.dirname(log_file)
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir)
        
        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=max_file_size,
            backupCount=backup_count,
            encoding='utf-8'
        )
        file_handler.setFormatter(logging.Formatter(log_format))
        file_handler.setLevel(level)
        
        logging.getLogger().addHandler(file_handler)
    
    return logging.getLogger(__name__)

def get_logger(name):
    return logging.getLogger(name)

if __name__ == '__main__':
    setup_logging(log_level='DEBUG', log_file='../logs/test.log')
    
    logger = get_logger('test')
    logger.debug('This is a debug message')
    logger.info('This is an info message')
    logger.warning('This is a warning message')
    logger.error('This is an error message')
    logger.critical('This is a critical message')