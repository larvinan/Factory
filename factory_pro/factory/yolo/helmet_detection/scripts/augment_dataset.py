import argparse
import os
import cv2
import random
import numpy as np
import albumentations as A

def load_yolo_labels(label_path, img_width, img_height):
    labels = []
    if os.path.exists(label_path):
        with open(label_path, 'r') as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) >= 5:
                    class_id = int(parts[0])
                    cx = float(parts[1]) * img_width
                    cy = float(parts[2]) * img_height
                    w = float(parts[3]) * img_width
                    h = float(parts[4]) * img_height
                    
                    x_min = cx - w / 2
                    y_min = cy - h / 2
                    x_max = cx + w / 2
                    y_max = cy + h / 2
                    
                    labels.append([x_min, y_min, x_max, y_max, class_id])
    
    return labels

def save_yolo_labels(label_path, labels, img_width, img_height):
    with open(label_path, 'w') as f:
        for label in labels:
            x_min, y_min, x_max, y_max, class_id = label
            
            cx = (x_min + x_max) / 2 / img_width
            cy = (y_min + y_max) / 2 / img_height
            w = (x_max - x_min) / img_width
            h = (y_max - y_min) / img_height
            
            if cx < 0 or cx > 1 or cy < 0 or cy > 1:
                continue
            if w <= 0 or h <= 0:
                continue
            if w > 1:
                w = 1.0
            if h > 1:
                h = 1.0
            
            f.write(f'{class_id} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}\n')

def augment_image(image, labels, transform, target_size=640):
    if len(labels) == 0:
        resized = cv2.resize(image, (target_size, target_size), interpolation=cv2.INTER_LINEAR)
        return resized, []
    
    bboxes = [[label[0], label[1], label[2], label[3]] for label in labels]
    class_labels = [label[4] for label in labels]
    
    transformed = transform(image=image, bboxes=bboxes, class_labels=class_labels)
    transformed_image = transformed['image']
    transformed_bboxes = transformed['bboxes']
    transformed_class_labels = transformed['class_labels']
    
    new_labels = []
    for bbox, class_id in zip(transformed_bboxes, transformed_class_labels):
        x_min, y_min, x_max, y_max = bbox
        
        if x_min >= x_max or y_min >= y_max:
            continue
        
        new_labels.append([x_min, y_min, x_max, y_max, class_id])
    
    return transformed_image, new_labels

def main():
    parser = argparse.ArgumentParser(description='Augment dataset using albumentations')
    parser.add_argument('--input-dir', type=str, required=True, help='input directory containing images')
    parser.add_argument('--output-dir', type=str, default='../datasets/augmented', help='output directory')
    parser.add_argument('--num-augmentations', type=int, default=3, help='number of augmentations per image')
    parser.add_argument('--target-size', type=int, default=640, help='target image size for resize')
    args = parser.parse_args()
    
    os.makedirs(os.path.join(args.output_dir, 'images'), exist_ok=True)
    os.makedirs(os.path.join(args.output_dir, 'labels'), exist_ok=True)
    
    image_extensions = ['.jpg', '.jpeg', '.png', '.bmp']
    
    transform = A.Compose([
        A.RandomRotate90(p=0.5),
        A.Flip(p=0.5),
        A.RandomBrightnessContrast(brightness_limit=0.3, contrast_limit=0.3, p=0.5),
        A.HueSaturationValue(hue_shift_limit=20, sat_shift_limit=30, val_shift_limit=20, p=0.5),
        A.GaussianBlur(blur_limit=(3, 7), p=0.3),
        A.GaussNoise(var_limit=(10, 50), p=0.3),
        A.Resize(height=args.target_size, width=args.target_size, p=1.0),
    ], bbox_params=A.BboxParams(format='pascal_voc', label_fields=['class_labels']))
    
    image_files = []
    for root, dirs, files in os.walk(args.input_dir):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in image_extensions:
                image_files.append(os.path.join(root, file))
    
    print(f'Found {len(image_files)} images')
    
    augmented_count = 0
    
    for img_path in image_files:
        image = cv2.imread(img_path)
        if image is None:
            continue
        
        h, w = image.shape[:2]
        label_path = os.path.splitext(img_path)[0] + '.txt'
        labels = load_yolo_labels(label_path, w, h)
        
        filename = os.path.splitext(os.path.basename(img_path))[0]
        ext = os.path.splitext(os.path.basename(img_path))[1]
        
        for i in range(args.num_augmentations):
            aug_image, aug_labels = augment_image(image, labels, transform, args.target_size)
            
            aug_filename = f'{filename}_aug_{i}{ext}'
            aug_img_path = os.path.join(args.output_dir, 'images', aug_filename)
            aug_label_path = os.path.join(args.output_dir, 'labels', f'{filename}_aug_{i}.txt')
            
            cv2.imwrite(aug_img_path, aug_image)
            
            aug_h, aug_w = aug_image.shape[:2]
            save_yolo_labels(aug_label_path, aug_labels, aug_w, aug_h)
            
            augmented_count += 1
        
        orig_img_path = os.path.join(args.output_dir, 'images', os.path.basename(img_path))
        orig_label_path = os.path.join(args.output_dir, 'labels', os.path.basename(label_path))
        
        resized_image = cv2.resize(image, (args.target_size, args.target_size))
        cv2.imwrite(orig_img_path, resized_image)
        
        resized_labels = []
        for label in labels:
            x_min, y_min, x_max, y_max, class_id = label
            x_min = x_min * args.target_size / w
            y_min = y_min * args.target_size / h
            x_max = x_max * args.target_size / w
            y_max = y_max * args.target_size / h
            resized_labels.append([x_min, y_min, x_max, y_max, class_id])
        
        save_yolo_labels(orig_label_path, resized_labels, args.target_size, args.target_size)
    
    print(f'Augmentation completed: {augmented_count} augmented images')
    print(f'Total images: {len(image_files) + augmented_count}')

if __name__ == '__main__':
    main()