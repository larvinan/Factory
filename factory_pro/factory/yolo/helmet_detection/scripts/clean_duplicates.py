import os
from pathlib import Path

def remove_duplicate_labels(label_dir):
    label_path = Path(label_dir)
    removed_count = 0
    
    for label_file in label_path.glob("*.txt"):
        with open(label_file, 'r') as f:
            lines = f.readlines()
        
        unique_lines = []
        seen = set()
        for line in lines:
            parts = line.strip().split()
            key = tuple(parts)
            if key not in seen:
                seen.add(key)
                unique_lines.append(line)
            else:
                removed_count += 1
        
        if len(unique_lines) != len(lines):
            with open(label_file, 'w') as f:
                f.writelines(unique_lines)
            print(f"清理: {label_file.name}, 移除 {len(lines) - len(unique_lines)} 个重复框")
    
    print(f"\n总共移除 {removed_count} 个重复标注")

remove_duplicate_labels(r"E:\竞赛\揭榜挂帅擂台赛\安全帽识别\datasets\labels\train")
remove_duplicate_labels(r"E:\竞赛\揭榜挂帅擂台赛\安全帽识别\datasets\labels\val")