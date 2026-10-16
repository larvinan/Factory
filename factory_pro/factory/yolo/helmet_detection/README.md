# 安全帽识别系统 - YOLOv5n + RK3568

基于YOLOv5n的安全帽识别系统，部署于RK3568开发板，支持实时检测、禁区判断和告警联动。

## 项目结构

```
安全帽识别/
├── data/
│   └── data.yaml              # 数据集配置文件
├── configs/
│   └── zones.yaml             # 禁区配置文件
├── datasets/
│   ├── train/
│   │   ├── images/            # 训练集图片
│   │   └── labels/            # 训练集标注
│   └── val/
│       ├── images/            # 验证集图片
│       └── labels/            # 验证集标注
├── models/                    # 训练模型保存目录
└── scripts/
    ├── augment_dataset.py     # 数据增强脚本
    ├── calib_data.py          # 校准数据准备脚本
    ├── convert_model.py       # 模型转换脚本(PT->ONNX->RKNN)
    ├── helmet_detection.py    # 安全帽识别逻辑
    ├── main_inference.py      # 主推理管道
    ├── postprocess.py         # 推理后处理(NMS)
    ├── preprocess.py          # 图像预处理
    ├── split_dataset.py       # 数据集划分脚本
    ├── test_pipeline.py       # 端到端测试脚本
    ├── train.py               # 模型训练脚本
    ├── v4l2_capture.c         # V4L2摄像头采集(C代码)
    ├── v4l2_capture.h         # V4L2头文件
    ├── Makefile               # 交叉编译Makefile
    └── alert_manager.py       # 告警管理模块
```

## 环境准备

### 1. 训练环境

```bash
conda create -n helmet_train python=3.10
conda activate helmet_train
pip install ultralytics torch torchvision numpy opencv-python pyyaml albumentations
```

### 2. RKNN转换环境 (需单独环境)

RKNN-Toolkit2与Ultralytics有依赖冲突，需使用独立环境：

```bash
conda create -n rknn_convert python=3.8
conda activate rknn_convert
pip install rknn-toolkit2==1.5.2 torch==1.13.1 numpy==1.24.0
```

## 使用说明

### 阶段1：数据集准备

#### 数据增强

```bash
cd scripts
python augment_dataset.py --input-dir ../datasets/raw --output-dir ../datasets/augmented --num-augmentations 3
```

#### 数据集划分

```bash
python split_dataset.py --source ../datasets/augmented --train-dir ../datasets/train --val-dir ../datasets/val --ratio 0.8
```

### 阶段2：模型训练

```bash
python train.py --data ../data/data.yaml --weights yolov5n.pt --epochs 100 --batch-size 16 --img-size 640
```

### 阶段3：模型转换

#### 生成校准数据

```bash
python calib_data.py --image-dir ../datasets/train/images --output-dir ../data/calib_data --sample-count 200
```

#### 转换为ONNX

```bash
python convert_model.py --pt-path ../models/helmet_detection/weights/best.pt --onnx-path ../models/yolov5n.onnx
```

#### 转换为RKNN

```bash
python convert_model.py --pt-path ../models/helmet_detection/weights/best.pt --rknn-path ../models/yolov5n.rknn --calib-list ../data/calib_data/calib_list.txt
```

### 阶段4：推理部署

#### PC端测试 (使用PyTorch模型)

```bash
python main_inference.py --model ../models/helmet_detection/weights/best.pt --source 0 --display
```

#### RK3568部署 (使用RKNN模型)

```bash
python main_inference.py --model ../models/yolov5n.rknn --source 0 --zones-config ../configs/zones.yaml --mqtt-broker your_broker_ip
```

### 端到端测试

```bash
python test_pipeline.py
```

## 类别定义

| 类别ID | 名称 | 说明 |
|--------|------|------|
| 0 | person | 人体（无论是否戴安全帽都要框出） |
| 1 | helmet | 安全帽（框在头部区域） |
| 2 | no_helmet | 未戴安全帽的头部 |

## 禁区配置

在 `configs/zones.yaml` 中配置禁区多边形坐标：

```yaml
zones:
  Zone_A:
    - [100, 100]
    - [300, 100]
    - [300, 400]
    - [100, 400]
```

## 告警级别

| 告警级别 | 触发条件 | 联动动作 |
|----------|----------|----------|
| 警告 | 未戴安全帽 | 黄色LED闪烁、语音播报 |
| 严重 | 闯入禁区 | 红色LED闪烁、蜂鸣器 |
| 紧急 | 未戴安全帽+闯入禁区 | 声光报警、排风联动 |

## MQTT消息格式

```json
{
  "type": "ai_alert",
  "alert_type": "no_helmet",
  "timestamp": "2026-08-15T14:30:00",
  "location": "车间A",
  "person_id": 1,
  "bbox": [100, 200, 150, 350],
  "image_url": "可选：抓拍图片路径"
}
```

## 性能指标

- 目标推理速度：< 200ms/帧 (5FPS以上)
- 目标检测精度：mAP@0.5 > 0.75
- 联动响应时延：< 500ms

## 注意事项

1. 训练环境和RKNN转换环境需使用独立虚拟环境
2. 预处理参数必须与训练时完全一致
3. 数据集划分时注意避免同一场景图片分散到训练集和验证集
4. INT8量化需要准备约200张校准图片