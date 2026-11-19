# 2D 视觉项目全流程

> 需求 → 数据 → 选型 → 训练 → 评估 → 部署 → 迭代，模型只是其中一环。

## 全流程地图

```
1. 需求澄清      任务类型？精度下限？延迟预算？硬件？
      ↓
2. 数据工程      采集 / 标注 / 清洗 / 版本管理（工作量常 >50%）
      ↓
3. 基线选型      先跑通 yolo26n/m 基线，再谈优化
      ↓
4. 训练调优      迁移学习 → 数据增强 → 超参 → 错误分析
      ↓
5. 评估验收      业务阈值下的 P/R，速度实测，边界 case
      ↓
6. 部署工程      ONNX → TensorRT/RKNN → C++ 集成 → 多路并发
      ↓
7. 上线迭代      监控漂移 → 难例回流 → 周期性重训
```

## 每一步的关键产物

| 阶段 | 产物 |
|------|------|
| 需求 | 指标定义表（mAP 还是业务 recall？） |
| 数据 | 版本化数据集 + 标注规范文档 |
| 选型 | 基线指标 + 延迟实测 |
| 训练 | best.pt + 训练曲线 + 混淆矩阵 |
| 评估 | 测试集报告 + 失败 case 清单 |
| 部署 | engine/rknn + C++ demo + 性能报告 |
| 迭代 | 数据回流机制 + 重训 SOP |

## 反查图谱

遇到具体问题时按域检索：

- 小目标漏检 → `task.detect`、`loss.stal`、`train.augment`
- 掩码不贴边 → `task.inst_seg`、`neck.proto`
- 需要测距 → `task.depth`、`task.depth_fusion`
- 板端跑不动 → `deploy.rknn_quant`、`deploy.compression`、`deploy.engineering`
- 量化掉点 → `practice.pitfalls`、`deploy.tensorrt_quant`

## 常见坑

- 没有独立测试集，指标虚高
- 数据标注规范不一致（框紧贴 vs 松贴）
- 部署后不做前后处理对齐验证
- 一上来就调大模型，忽略数据质量

## 延伸与关联

- 选型：`practice.selection`
- 场景：`practice.industrial` / `security` / `robot`
- 交付：`practice.checklist`
