# TAL 任务对齐标签分配

> 用「分类 × 定位」的联合对齐度动态挑正样本，取代手工 IoU 阈值。

## 这是什么

TAL（Task-Aligned Assigner，TOOD 提出、YOLOv8 采用）解决「哪些 anchor/网格算正样本」：
按 `t = s^α · u^β`（分类得分 s、IoU u）排序取 top-k，让分类好且定位准的样本当正样本。

## 关键公式

```
alignment  t = (score)^α × (IoU)^β
正样本     = 每个目标 top-k 个 t 最大的预测点
```

α、β 控制更偏分类还是更偏定位；k 通常与目标大小相关。

## 为什么有效

- 手工规则（IoU>0.5）对密集/小目标不友好
- TAL 让「分类得分高」与「框准」对齐，缓解分类-定位不一致
- 端到端可导，不需要预设 anchor

## STAL（YOLO26 增强）

YOLO26 的 STAL（Small-Target-Aware Label Assignment）在 TAL 之上针对小目标
调整分配，改善密集微小目标的召回与定位，是 v26 训练配方重要组成。

## 常见坑

- α/β 乱调导致正样本忽多忽少，loss 波动
- 自定义数据目标极小（<8px）时，单纯 TAL 不够，需提高分辨率或用 STAL/加 P2
- 与旧代码里的 SimOTA 混用会逻辑冲突

## 延伸与关联

- 前置：`loss.assign_legacy`（ATSS/SimOTA）
- 实现层：`head.tal`
- 相关：`loss.stal`、`loss.progloss`
