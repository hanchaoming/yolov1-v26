# C++ 推理通用范式

> 预处理 → 推理 → 后处理三段式，与训练保持一致是第一原则。

## 这是什么

无论 TensorRT、RKNN 还是 ONNX Runtime，C++ 部署都遵循同一套流水线：
把图像喂进网络、拿回原始输出张量、还原成业务可用的框/mask/深度图。

## 三段式流水线

```
输入图像 (BGR)
   │  ① 预处理
   │     letterbox 保比例缩放 + 灰边
   │     BGR→RGB、/255、NCHW 布局
   ▼
输入张量 (1,3,H,W)
   │  ② 推理
   │     TensorRT enqueue / rknn_run / ORT Run
   ▼
输出张量 (1, C, N ...)
   │  ③ 后处理
   │     decode 框 + 类别
   │     置信度过滤 + NMS（或 NMS-free 直出）
   │     坐标按 letterbox 逆变换回原图
   ▼
检测结果 (xyxy, cls, conf)
```

## 与训练对齐的检查清单

- [ ] letterbox 的颜色（114 灰）与缩放系数一致
- [ ] 归一化方式一致（`/255` vs mean/std）
- [ ] 通道序一致（RGB vs BGR）
- [ ] 输出 stride / anchor（若有）与训练匹配
- [ ] 类别顺序与训练 YAML 一致

## 工程优化要点

- 预处理/推理/后处理 **流水线并行**（线程或 CUDA stream）
- 多路视频：解码线程池 + 批量推理 + 结果分发
- 显存/内存池复用，避免每帧 malloc
- 用固定 shape 减少动态分配

## 最小 C++ 骨架（概念）

```cpp
// 伪代码示意
cv::Mat img = cv::imread("bus.jpg");
auto input = letterbox(img, 640);          // ①
engine->infer(input, output);              // ②
auto dets = decode_nms(output, img.size()); // ③
```

## 常见坑

- 前后处理用 Python 写、推理用 C++ 写 → 两套逻辑漂移，精度莫名其妙
- 忘记把框坐标映射回原图尺度 → 业务侧框全错位
- NMS 阈值沿用训练默认值，未按业务场景调
- 多线程共享 engine/context 导致数据竞争

## 延伸与关联

- 具体后端：`deploy.tensorrt_cpp`、`deploy.rknn_cpp`、`deploy.onnxrt`
- 免后处理趋势：`deploy.nmsfree_adv`
- 多路优化：`deploy.engineering`
