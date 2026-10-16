import argparse
import os
import random
import cv2

def generate_calib_list(image_dir, output_file, sample_count=200):
    image_extensions = ['.jpg', '.jpeg', '.png', '.bmp']
    
    image_files = []
    for root, dirs, files in os.walk(image_dir):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in image_extensions:
                image_files.append(os.path.join(root, file))
    
    if len(image_files) == 0:
        print(f'Error: No images found in {image_dir}')
        return False
    
    sample_count = min(sample_count, len(image_files))
    sampled_files = random.sample(image_files, sample_count)
    
    with open(output_file, 'w') as f:
        for img_path in sampled_files:
            f.write(f'{img_path}\n')
    
    print(f'Calibration list generated: {output_file}')
    print(f'Number of images: {sample_count}')
    return True

def generate_calib_images(image_dir, output_dir, target_size=640, sample_count=200):
    image_extensions = ['.jpg', '.jpeg', '.png', '.bmp']
    
    os.makedirs(output_dir, exist_ok=True)
    
    image_files = []
    for root, dirs, files in os.walk(image_dir):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in image_extensions:
                image_files.append(os.path.join(root, file))
    
    if len(image_files) == 0:
        print(f'Error: No images found in {image_dir}')
        return False
    
    sample_count = min(sample_count, len(image_files))
    sampled_files = random.sample(image_files, sample_count)
    
    calib_list_path = os.path.join(output_dir, 'calib_list.txt')
    
    with open(calib_list_path, 'w') as f:
        for i, img_path in enumerate(sampled_files):
            image = cv2.imread(img_path)
            if image is None:
                continue
            
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
            
            padded = cv2.copyMakeBorder(resized, top, bottom, left, right, 
                                        cv2.BORDER_CONSTANT, value=(114, 114, 114))
            
            output_path = os.path.join(output_dir, f'calib_{i:04d}.jpg')
            cv2.imwrite(output_path, padded)
            
            f.write(f'{output_path}\n')
    
    print(f'Calibration images generated in: {output_dir}')
    print(f'Calibration list: {calib_list_path}')
    print(f'Number of images: {sample_count}')
    return True

def main():
    parser = argparse.ArgumentParser(description='Generate calibration data for RKNN INT8 quantization')
    parser.add_argument('--image-dir', type=str, required=True, help='directory containing images')
    parser.add_argument('--output-dir', type=str, default='../data/calib_data', help='output directory')
    parser.add_argument('--sample-count', type=int, default=200, help='number of images to sample')
    parser.add_argument('--target-size', type=int, default=640, help='target image size')
    parser.add_argument('--generate-images', action='store_true', default=False, help='generate preprocessed images')
    args = parser.parse_args()

    if args.generate_images:
        generate_calib_images(args.image_dir, args.output_dir, args.target_size, args.sample_count)
    else:
        output_file = os.path.join(args.output_dir, 'calib_list.txt')
        os.makedirs(args.output_dir, exist_ok=True)
        generate_calib_list(args.image_dir, output_file, args.sample_count)

if __name__ == '__main__':
    main()