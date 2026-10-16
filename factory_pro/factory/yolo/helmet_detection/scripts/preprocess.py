import cv2
import numpy as np
import logging

logger = logging.getLogger(__name__)

def yuyv_to_rgb(yuyv_data, width, height):
    yuyv_array = np.frombuffer(yuyv_data, dtype=np.uint8)
    yuyv_array = yuyv_array.reshape(height, width * 2)
    bgr_img = cv2.cvtColor(yuyv_array, cv2.COLOR_YUV2BGR_YUYV)
    rgb_img = cv2.cvtColor(bgr_img, cv2.COLOR_BGR2RGB)
    return rgb_img

def resize_and_pad(image, target_size=640, pad_color=(114, 114, 114)):
    h, w = image.shape[:2]
    scale = min(target_size / w, target_size / h)
    new_w, new_h = int(w * scale), int(h * scale)
    resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    
    pad_w = target_size - new_w
    pad_h = target_size - new_h
    top = pad_h // 2
    bottom = pad_h - top
    left = pad_w // 2
    right = pad_w - left
    
    padded = cv2.copyMakeBorder(resized, top, bottom, left, right, cv2.BORDER_CONSTANT, value=pad_color)
    return padded, scale, (left, top)

def normalize(image, mean=None, std=None, scale=1.0):
    img = image.astype(np.float32)
    if scale == 1.0:
        img /= 255.0
    elif scale == 255.0:
        pass
    else:
        img /= scale
    
    if mean is not None:
        mean = np.array(mean, dtype=np.float32)
        img -= mean
    
    if std is not None:
        std = np.array(std, dtype=np.float32)
        img /= std
    
    return img

def hwc_to_nchw(image):
    return np.transpose(image, (2, 0, 1))

def preprocess_image(image, target_size=640, normalize_scale=1.0, mean=None, std=None):
    if len(image.shape) == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
    
    padded, scale, padding = resize_and_pad(image, target_size)
    normalized = normalize(padded, mean, std, normalize_scale)
    input_tensor = hwc_to_nchw(normalized)
    input_tensor = np.expand_dims(input_tensor, axis=0)
    
    logger.debug(f'Preprocess: input={image.shape}, output={input_tensor.shape}, scale={scale}, padding={padding}')
    return input_tensor, scale, padding

def preprocess_yuyv_frame(yuyv_data, width, height, target_size=640):
    rgb_image = yuyv_to_rgb(yuyv_data, width, height)
    return preprocess_image(rgb_image, target_size)

if __name__ == '__main__':
    import sys
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    
    if len(sys.argv) != 3:
        logger.error('Usage: python preprocess.py <input_image> <output_image>')
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    image = cv2.imread(input_path)
    if image is None:
        logger.error(f'Cannot read image {input_path}')
        sys.exit(1)
    
    image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    tensor, scale, padding = preprocess_image(image)
    
    logger.info(f'Input shape: {image.shape}')
    logger.info(f'Output tensor shape: {tensor.shape}')
    logger.info(f'Scale: {scale}')
    logger.info(f'Padding: {padding}')
    
    cv2.imwrite(output_path, cv2.cvtColor(tensor[0].transpose(1, 2, 0) * 255, cv2.COLOR_RGB2BGR))
    logger.info(f'Preprocessed image saved to {output_path}')