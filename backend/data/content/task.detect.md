# 目标检测 Detect

> 在图像中输出目标的边界框、类别与置信度，是 YOLO 的基础任务。

## 这是什么

目标检测回答「图里有什么、在哪里」：对每个目标输出 `(x, y, w, h)` 框、类别 ID、置信度。
YOLO 作为一阶段检测器，一次前向同时完成定位与分类，天然适合实时场景。

## 输出结构

- `result.boxes.xyxy` 框坐标（原图尺度）
- `result.boxes.conf` 置信度
- `result.boxes.cls` 类别

## 关键流程

1. **输入**：LetterBox 保比例缩放至 `imgsz`（默认 640）
2. **骨干**：提取多尺度特征（P3/P4/P5）
3. **颈部**：FPN/PAN 融合
4. **头部**：预测框 + 类别（anchor-free + TAL）
5. **后处理**：置信度过滤 + NMS（或 YOLO26 端到端直出）

## 训练要点

- 数据格式：YOLO txt（每行 `cls cx cy w h` 归一化）
- 小目标：提高 `imgsz`（960/1280）、保留 Mosaic 后期、关注 P2 头（YOLO26 提供 P2 YAML）
- 类别不均衡：关注难分样本，必要时用 class weight 或重采样

## 选型建议

| 场景 | 建议 |
|------|------|
| 边缘实时 | yolo26n / yolo26s |
| 精度优先 | yolo26m / l / x |
| 免后处理 | yolo26 + `nms=False` |
| 开放类别 | YOLOE / YOLO-World |

## 常见坑

- 训练与部署的 letterbox/归一化不一致 → 精度大幅下降
- 只看 mAP50 过于宽松，生产上应关注 mAP50-95 与业务阈值下的 recall
- 密集遮挡场景 NMS 阈值过低会误删，考虑 NMS-free 或调 `iou`

## 延伸与关联

- 先修：`foundation.detect_def`、`foundation.iou`、`foundation.nms`
- 进阶任务：`task.inst_seg`、`task.pose`、`task.obb`
- 指标：`eval.map`、`eval.pr`
