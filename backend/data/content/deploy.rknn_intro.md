# RKNN 入门（rknn-toolkit2）

> 把 YOLO 部署到 Rockchip NPU（RK3588 / RK3576 等）的官方转换链路。

## 这是什么

RKNN 是瑞芯微 NPU 的模型格式；`rknn-toolkit2` 在 PC 上把 ONNX 转成 RKNN，
板端用 `librknnrt` 运行。Ultralytics 导出表已内置 RKNN 目标。

## 转换流程

```python
from rknn.api import RKNN

rknn = RKNN()
rknn.config(mean_values=[[0,0,0]], std_values=[[255,255,255]],
            target_platform="rk3588")
rknn.load_onnx(model="yolo26n.onnx")
rknn.build(do_quantization=True, dataset="calib_list.txt")
rknn.export_rknn("yolo26n.rknn")
```

Ultralytics 路线：

```bash
yolo export model=yolo26n.pt format=rknn imgsz=640
```

## 量化校准

- PTQ 量化建议 **50–1000 张**代表性图片
- 量化后重点核对：小目标召回、密集场景、类别边界
- 掉点明显时：改用混合精度（部分层保留 fp16）或增加校准集

## 板端运行（C API 三步）

1. `rknn_init` 加载模型
2. `rknn_inputs_set` → `rknn_run` → `rknn_outputs_get`
3. 后处理（decode + NMS 或 NMS-free 直出）

注意 zero-copy、内存对齐、以及 NPU 核心调度（RK3588 多核）。

## 常见坑

- 算子不支持 → 优先改模型结构（避免奇葩算子），而不是硬转
- 量化图与浮点图行为不一致 → 用 `rknn_evaluator` 做逐层比对
- 板端性能受内存带宽影响，多路视频时先测吞吐再定路数
- `target_platform` 填错会得到次优内核

## 延伸与关联

- 先修：`deploy.onnx`
- 进阶：`deploy.rknn_quant`、`deploy.rknn_cpp`
- 通用范式：`deploy.cpp_pipeline`
