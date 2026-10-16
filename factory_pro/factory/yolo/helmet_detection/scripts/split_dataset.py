import argparse
import os
import shutil
import random
from collections import defaultdict

def get_scene_group(image_path, scene_patterns=None):
    filename = os.path.basename(image_path)
    
    if scene_patterns:
        for scene_name, patterns in scene_patterns.items():
            for pattern in patterns:
                if pattern.lower() in filename.lower():
                    return scene_name
    
    return filename.split('_')[0]

def split_dataset(source_dir, train_dir, val_dir, split_ratio=0.8, scene_patterns=None):
    image_extensions = ['.jpg', '.jpeg', '.png', '.bmp']
    
    image_files = []
    for root, dirs, files in os.walk(source_dir):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in image_extensions:
                image_files.append(os.path.join(root, file))
    
    if len(image_files) == 0:
        print(f'Error: No images found in {source_dir}')
        return False
    
    scene_groups = defaultdict(list)
    
    for img_path in image_files:
        scene = get_scene_group(img_path, scene_patterns)
        scene_groups[scene].append(img_path)
    
    print(f'Found {len(scene_groups)} scene groups')
    
    scenes = list(scene_groups.keys())
    random.seed(42)
    random.shuffle(scenes)
    
    num_train_scenes = int(len(scenes) * split_ratio)
    train_scenes = set(scenes[:num_train_scenes])
    val_scenes = set(scenes[num_train_scenes:])
    
    train_images = []
    val_images = []
    
    for scene, images in scene_groups.items():
        if scene in train_scenes:
            train_images.extend(images)
        else:
            val_images.extend(images)
    
    os.makedirs(os.path.join(train_dir, 'images'), exist_ok=True)
    os.makedirs(os.path.join(train_dir, 'labels'), exist_ok=True)
    os.makedirs(os.path.join(val_dir, 'images'), exist_ok=True)
    os.makedirs(os.path.join(val_dir, 'labels'), exist_ok=True)
    
    for img_path in train_images:
        filename = os.path.basename(img_path)
        label_path = os.path.splitext(img_path)[0] + '.txt'
        
        shutil.copy(img_path, os.path.join(train_dir, 'images', filename))
        
        if os.path.exists(label_path):
            shutil.copy(label_path, os.path.join(train_dir, 'labels', os.path.basename(label_path)))
    
    for img_path in val_images:
        filename = os.path.basename(img_path)
        label_path = os.path.splitext(img_path)[0] + '.txt'
        
        shutil.copy(img_path, os.path.join(val_dir, 'images', filename))
        
        if os.path.exists(label_path):
            shutil.copy(label_path, os.path.join(val_dir, 'labels', os.path.basename(label_path)))
    
    print(f'Train set: {len(train_images)} images')
    print(f'Validation set: {len(val_images)} images')
    print(f'Train scenes: {len(train_scenes)}')
    print(f'Validation scenes: {len(val_scenes)}')
    
    return True

def main():
    parser = argparse.ArgumentParser(description='Split dataset into train/val with scene grouping')
    parser.add_argument('--source', type=str, required=True, help='source directory containing all images')
    parser.add_argument('--train-dir', type=str, default='../datasets/train', help='train set directory')
    parser.add_argument('--val-dir', type=str, default='../datasets/val', help='validation set directory')
    parser.add_argument('--ratio', type=float, default=0.8, help='train/val split ratio')
    args = parser.parse_args()
    
    scene_patterns = {
        'workshop_a': ['ws_a', 'workshop_a', '车间a'],
        'workshop_b': ['ws_b', 'workshop_b', '车间b'],
        'factory': ['factory', '工厂'],
        'lab': ['lab', '实验室'],
        'outdoor': ['outdoor', '室外'],
        'night': ['night', '夜间'],
        'day': ['day', '白天'],
    }
    
    split_dataset(args.source, args.train_dir, args.val_dir, args.ratio, scene_patterns)

if __name__ == '__main__':
    main()