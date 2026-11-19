# 实例分割 Segment

> 为每个目标生成独立掩码（N, H, W）并给出框，可数、可裁剪、可逐目标测量。

## 这是什么

实例分割 = 检测 + 逐实例像素级分割。同一类别的不同目标会得到**各自独立**的 mask。
YOLO 的实现是「原型掩码 + 系数」：网络输出一组原型 mask（proto）和每个目标的系数，
线性组合后 sigmoid 得到实例 mask，非常轻量。

## 输出结构

- `result.masks.data` → (N, H, W) 二值 mask
- `result.masks.xy` → 多边形轮廓
- `result.boxes` → 框 + 置信度

## 权重与训练

```python
model = YOLO("yolo26n-seg.pt")
results = model.train(data="your_seg.yaml", epochs=100, imgsz=640)
```

- 数据格式：YOLO 多边形 txt（`cls x1 y1 x2 y2 ...`）或 COCO json
- YOLO26 升级多尺度 proto，mask 质量显著优于 YOLO11
- 需要精细边缘时用 `retina_masks=True`（原始分辨率 mask，较慢）

## 与语义分割的分界

| | 实例分割 | 语义分割 |
|---|---|---|
| 区分同类实例 | ✅ | ❌ 合并 |
| 输出 | (N,H,W) + 框 | (H,W) 类别图 |
| 典型用途 | 计数/跟踪/裁剪/测尺寸 | 场景解析/可行驶区域 |

## 常见坑

- 掩码边缘溢出到相邻目标：可做腐蚀后处理，或提高分辨率再训
- 小目标 mask 粗糙：提高 `imgsz`，或 `retina_masks=True`
- 把语义需求当实例做 → 输出冗余；反之计数需求用语义分割会失败

## 延伸与关联

- 先修：`task.detect`、`neck.proto`
- 对比：`task.seg_vs_sem`、`task.sem_seg`
- 部署：mask 输出张量较大，TensorRT/RKNN 需核对 proto 维度
