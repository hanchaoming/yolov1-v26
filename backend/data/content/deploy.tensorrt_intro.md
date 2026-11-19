# TensorRT 入门与 Engine 构建

> NVIDIA GPU 上延迟最低的推理路径：ONNX → Engine → Runtime。

## 这是什么

TensorRT 是 NVIDIA 的推理优化器与运行时：对网络做层融合、内核自动调优、
精度量化，产出与特定 GPU 绑定的 **engine** 文件。

## 构建流程

```bash
# 方式一：Ultralytics 一键导出
yolo export model=yolo26n.pt format=engine half=True imgsz=640

# 方式二：trtexec（TensorRT 自带）
trtexec --onnx=yolo26n.onnx --saveEngine=yolo26n.engine \
        --fp16 --workspace=4096
```

Python API 路线（可控性更强）：

```python
from ultralytics import YOLO
model = YOLO("yolo26n.pt")
model.export(format="engine", half=True, dynamic=False, workspace=4)
```

## 关键选项

| 选项 | 说明 |
|------|------|
| `half=True` | FP16，速度↑精度近似无损 |
| `dynamic=True` | 动态 shape（H/W/batch），灵活但可能掉速 |
| `workspace` | 构建期显存预算（GB） |
| `nms=True/False` | 是否把 NMS 焊进图（YOLO26 可走 NMS-free） |
| `int8` + `data=` | INT8 量化需校准集 |

## 版本与兼容

- engine **不跨 TensorRT 大版本、不跨 GPU 架构**通用，需在目标环境构建
- 优先用与驱动匹配的 TensorRT 版本；CI 中缓存构建好的 engine

## 常见坑

- 忘了 `model.fuse()` / 导出时未优化 → 精度对但速度不达标
- 动态 shape 未设 optimization profile → 运行期报错
- INT8 校准图分布偏离真实数据 → 静默掉点，务必做量化前后精度回归
- Plugin 版本不匹配 → 加载 engine 失败

## 延伸与关联

- 进阶：`deploy.tensorrt_quant`、`deploy.tensorrt_cpp`、`deploy.tensorrt_plugin`
- 先修：`deploy.onnx`
- 评估：`eval.speed`（在目标 GPU 上实测延迟）
