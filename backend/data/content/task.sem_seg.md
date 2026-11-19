# 语义分割 Semantic

> 为每个像素分配类别标签，输出稠密类别图（H, W），不区分同类实例。

## 这是什么

语义分割做「逐像素分类」：所有同一类别的像素归入同一标签，不管有几个目标。
YOLO26 新增 `-sem` 任务，使 YOLO 系列首次原生覆盖该任务。

## 输出结构

```python
results = model("street.jpg")
mask = results[0].semantic_mask.data  # (H, W) 类别 ID
```

- 像素值 = 类别 ID（0, 1, 2...）
- 无框、无置信度、无多边形

## 模型与数据

| 权重 | 数据集 | 分辨率 | mIoU (n→x) |
|------|--------|--------|------------|
| `yolo26*-sem.pt` | Cityscapes (19 类) | 1024×2048 | 78.3 → 83.6 |
| `yolo26*-sem-ade20k.pt` | ADE20K (150 类) | 640 | 38.8 → 51.5 |

数据格式：单通道 PNG mask，像素值=类别 ID，**255 = 忽略**。
也支持 YOLO 多边形标签在线转 mask（YAML 中省略 `masks_dir`）。

## 训练与评估

```python
model = YOLO("yolo26n-sem.pt")
model.train(data="cityscapes.yaml", epochs=100, imgsz=1024)
metrics = model.val(data="cityscapes.yaml")
print(metrics.miou, metrics.pixel_accuracy)
```

## 常见坑

- 细长结构（车道线、杆件）在低分辨率下呈锯齿：先用 1024/1280 验证 `.pt`，再考虑导出
- 忘记把 ignore 区域标成 255 → 背景噪声进 loss
- 需要「数车辆个数」时别用语义分割，那是实例分割的活

## 延伸与关联

- 对比：`task.seg_vs_sem`、`task.inst_seg`
- 背景脉络：FCN → U-Net → DeepLab → SegFormer；YOLO26 走的是实时路线
- 指标：`eval.seg_metrics`
