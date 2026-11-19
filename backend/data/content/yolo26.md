# YOLO26

> 2026-01 Ultralytics 发布的实时端到端视觉模型系列，首个覆盖七任务的统一 YOLO。

## 这是什么

Ultralytics YOLO26（arXiv 2606.03748，Jocher 等）是 YOLO 系列当前旗舰：在同一套架构下同时支持
**目标检测、实例分割、语义分割、深度估计、图像分类、姿态估计、OBB** 七项任务，
并提供 n/s/m/l/x 五种尺度。它面向边缘与低功耗设备重新设计，CPU 推理速度较 YOLO11 最高提升 43%。

## 关键改进（相对 YOLO11）

| 改进 | 说明 |
|------|------|
| **可选 NMS-free 端到端** | 双头设计：一对多头训练、一对一头推理（`nms=False`，≤300 检测/图），延迟更低 |
| **移除 DFL** | 框回归不再依赖 Distribution Focal Loss，导出链路更简单、硬件兼容更广 |
| **MuSGD 优化器** | 融合 SGD 与 Muon 的混合优化器，借鉴 LLM 训练经验，训练更稳 |
| **ProgLoss + STAL** | 渐进损失把监督移向推理头；小目标感知标签分配改善密集微小目标 |
| **多尺度 Proto** | 实例分割掩码质量提升（对比 YOLO11 约 +2.5 box AP / +3.7 mask AP） |
| **log-depth 头** | 深度无界量程（约 0.02–150 m），`model.calibrate()` 可闭式标定绝对尺度 |

## 性能锚点（COCO detect，mAP50-95）

| 尺度 | mAP | 参数量级 | 适用 |
|------|-----|----------|------|
| n | 40.9 | 最小 | 边缘 / CPU |
| s | 48.6 | 小 | 速度精度平衡 |
| m | 53.1 | 中 | 多数应用首选 |
| l | 55.0 | 大 | 高精度 |
| x | 57.5 | 最大 | 精度优先 |

深度任务（NYU δ1，768px）：0.882 (n) → 0.933 (x)。
语义分割（Cityscapes mIoU，1024×2048）：78.3 (n) → 83.6 (x)。

## 怎么用

```python
from ultralytics import YOLO

# 七任务各自的权重命名
model = YOLO("yolo26n.pt")        # 检测
model = YOLO("yolo26n-seg.pt")    # 实例分割
model = YOLO("yolo26n-sem.pt")    # 语义分割
model = YOLO("yolo26n-depth.pt")  # 深度估计

results = model("bus.jpg")
```

NMS-free 推理：`model("bus.jpg", nms=False)`。

## 常见坑

- 迁移旧项目：接口与 YOLOv8/YOLO11 一致，**换权重即可**，但后处理若手写了 NMS，要决定保留还是走端到端。
- 量化部署前先确认 DFL 已移除带来的输出张量布局变化，重写 decode。
- 深度微调务必降学习率（AdamW, `lr0=1e-4`），否则覆盖预训练知识。
- 语义分割边界在低 `imgsz` 下易呈锯齿，优先用 1024+ 分辨率确认 `.pt` 效果再导出。

## 延伸与关联

- 对比选型：YOLO26 vs YOLO11 vs YOLOv8（Ultralytics 官方博客）
- 开放词汇版本：YOLOE-26（文本/视觉/无提示）
- 下一代：YOLO27 已进入候补名单，权重未发布
- 部署：见 `deploy.export` → TensorRT / RKNN / C++ 三条主线
