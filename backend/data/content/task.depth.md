# 深度估计 Depth

> 单目图像 → 逐像素深度图（米），为 2D 检测补上第三维距离信息。

## 这是什么

单目深度估计预测每个像素到相机的距离，输出 (H, W) 浮点图（单位：米）。
YOLO26 新增 `-depth` 任务，使 YOLO 管线内可以直接做实时测距。

## log-depth 头的设计

- 输出 `exp(logit)`，**无界**（约 0.02–150 m）
- **解耦场景形状与绝对尺度**：网络预测相对 log 深度，绝对米数由
  `exp(a·log d + b)` 两参数变换给出
- 对比：`sigmoid × max_depth` 有界头会把量程写死，超出即截断（KITTI 80m 场景会崩）

官方 A/B：同数据同日程，log 头混合量程 δ1 0.367，有界头仅 0.221 且 epoch 1 就停滞。

## 模型（NYU Eigen δ1 @768）

| 权重 | δ1 | abs_rel | T4 TensorRT |
|------|-----|---------|-------------|
| yolo26n-depth | 0.882 | 0.109 | 2.7 ms |
| yolo26s-depth | 0.896 | 0.104 | 3.8 ms |
| yolo26m-depth | 0.921 | 0.089 | 6.0 ms |
| yolo26l-depth | 0.930 | 0.083 | 7.7 ms |
| yolo26x-depth | 0.933 | 0.080 | 13.6 ms |

同硬件下比 Depth Anything V2 Small 快 1.5×（x）到 7.7×（n）。

## 训练与标定

数据：RGB 图 + 16bit PNG（毫米）或 NPY（米）深度图配对；`images/` ↔ `depth/` 目录对应。

```python
model = YOLO("yolo26s-depth.pt")
model.train(data="my.yaml", epochs=20, imgsz=640,
            optimizer="AdamW", lr0=1e-4, warmup_bias_lr=1e-4)

# 尺度标定（无需梯度训练，秒级）
model.calibrate(data="calib.yaml")
model.save("yolo26s-depth-calibrated.pt")
```

- **微调必降 lr**（约默认的 1/100），否则冲掉预训练
- mosaic/mixup/copy_paste 对深度自动禁用（会破坏配对）
- 无深度相机也能标定：每图测几个点（激光测距/卷尺）即可

## 逐目标距离（实用配方）

```python
seg = YOLO("yolo26n-seg.pt")(img, retina_masks=True)[0]
depth = YOLO("yolo26n-depth.pt")(img)[0].depth.data
for mask, cls in zip(seg.masks.data.bool(), seg.boxes.cls):
    v = depth[mask & (depth > 0)]
    if v.numel():
        print(seg.names[int(cls)], v.median().item(), "m")
```

## 常见坑

- 把相对深度当绝对米数用：先 `calibrate()` 或确认 checkpoint 自带标定
- 激光测距是斜距，深度图是沿光轴距离，偏离图像中心约 3.5%/15° 需换算
- 忽略 0 值像素（无效标注）再算中位数

## 延伸与关联

- 指标：`eval.depth_metrics`（δ1/abs_rel/RMSE/silog）
- 融合：`task.depth_fusion`
- 相关非 YOLO 方案：Depth Anything V2、Metric3D、UniDepth（可做伪标签）
