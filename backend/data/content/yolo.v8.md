# YOLOv8

> Ultralytics 2023 年里程碑：anchor-free + C2f + 解耦头 + TAL/DFL，统一多任务 API。

## 这是什么

YOLOv8 是第一个全面 anchor-free 的 Ultralytics YOLO，也是把检测 / 实例分割 /
分类 / 姿态 / OBB 统一到同一套 `YOLO()` API 的起点。它奠定了此后 v9-v26 的工程接口习惯。

## 相对 YOLOv5 的核心变化

| 模块 | YOLOv5 | YOLOv8 |
|------|--------|--------|
| 骨干块 | C3 | C2f（更多梯度分支） |
| 检测头 | 耦合 anchor 头 | 解耦 anchor-free 头 |
| 标签分配 | autoanchor + IoU | TAL 任务对齐分配 |
| 框回归 | CIoU | CIoU + DFL |
| API | `detect.py` | 统一 `YOLO()` 类 |

## 性能（COCO detect, mAP50-95）

| 尺度 | mAP |
|------|-----|
| n | 37.3 |
| s | 44.9 |
| m | 50.2 |
| l | 52.9 |
| x | 53.9 |

## 训练示例

```python
from ultralytics import YOLO
model = YOLO("yolo8n.pt")
model.train(data="coco8.yaml", epochs=100, imgsz=640)
```

## 为什么今天还要学 v8

- 大量存量项目、第三方集成（ROS、DeepStream、labeling 工具）仍基于 v8
- v8 → v11 → v26 的 API 高度兼容，理解 v8 等于掌握三代接口
- 后续版本的改进（C3k2、NMS-free、去 DFL）都是相对 v8 基线的增量

## 常见坑

- 从 v5 迁移时手写的 anchor 后处理代码全部作废
- DFL 输出维度较大，导出后处理要按 v8 布局解析
- 只用 `.pt` 训练调参，忽略导出后量化掉点

## 延伸与关联

- 前身：`yolo.v5`；后继：`yolo11` → `yolo26`
- 机制：`head.decoupled`、`head.tal`、`head.dfl`
- 训练配方：`train.hyperparam`
