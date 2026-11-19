# 卷积与 CNN 基础

> 卷积层提取局部特征、池化降采样、堆叠形成层级感受野，是一切检测骨干的原子单元。

## 这是什么

**卷积（Convolution）** 是一种「滑动加权求和」的运算：一个小矩阵（卷积核 / filter）在图像上按步长滑动，
每个位置把核与对应局部区域做逐元素乘再求和，得到输出特征图（feature map）的一个像素。

**CNN（Convolutional Neural Network，卷积神经网络）** 就是以卷积层为主体的神经网络：
卷积提取局部模式 → 激活引入非线性 → 池化/步长降采样 → 堆叠出由浅入深的特征层级。
YOLO 的骨干（Darknet、CSPDarknet、C2f…）本质上都是「卷积积木」的组合，所以这里是第一块基石。

一个典型的 YOLO 卷积块长这样（业内常叫 CBS）：

```
Conv2d (k×k)  →  BatchNorm2d  →  SiLU 激活
```

## 为什么需要它

- **没有卷积，就没有视觉特征提取**。全连接网络把图像拉成一维向量，会丢掉空间结构，
  参数量还爆炸（224×224×3 的图接 4096 个神经元 ≈ 6 亿参数）。
- 卷积带来三个关键先验，正好匹配图像的统计特性：
  1. **局部连接**：特征（边缘、角点、纹理）只在局部出现，不需要全图连接。
  2. **权重共享**：同一个核扫全图，参数量只与核大小有关，与图像尺寸无关。
  3. **平移等变性**：目标移动，特征图里的响应也相应移动。
- 在 YOLO 里，检测头预测框的前提是「特征图上有可判别的模式」——这些模式全靠卷积堆出来。
  理解卷积，才能理解后面 backbone 为什么那样设计（残差、CSP、注意力都是卷积的补充）。

## 怎么用 / 关键细节

### 1. 卷积运算与输出尺寸

设输入尺寸 $H \times W$，核大小 $k \times k$，步长 $s$，填充 $p$：

$$
H_{out} = \left\lfloor \frac{H + 2p - k}{s} \right\rfloor + 1
$$

PyTorch 里对应 `torch.nn.Conv2d(in_ch, out_ch, kernel_size, stride, padding)`。

| 配置 | 效果 | 典型用途 |
|------|------|----------|
| k=3, s=1, p=1 | 尺寸不变 | 特征提取的标准块 |
| k=1, s=1, p=0 | 尺寸不变 | 通道升降维（瓶颈层） |
| k=3, s=2, p=1 | 尺寸减半 | 下采样（替代池化，YOLO 常用） |
| k=2, s=2 | 尺寸减半 | 转置卷积上采样（见 SegFormer 等） |

> **`same` padding**：令 $p=(k-1)/2$，使 $H_{out}=\lceil H/s \rceil$，YOLO 里 3×3 s=1 p=1 就是 same 卷积。

### 2. 通道：卷积核是「一组」不是「一个」

- 输入 $C_{in}$ 通道时，每个输出通道的卷积核形状是 $C_{in} \times k \times k$；
- 输出 $C_{out}$ 通道就有 $C_{out}$ 组这样的核；
- 参数量 = $C_{out} \times (C_{in} \times k \times k + 1)$（+1 是 bias）。

**1×1 卷积**（Lin et al., Network in Network）不看空间、只做通道混合：
参数 $C_{in} \times C_{out}$，常用于升/降维与跨通道信息整合，是 Bottleneck、C2f 里的常客。

### 3. 计算量（FLOPs）估算

单层卷积的乘加次数（MACs）≈

$$
H_{out} \times W_{out} \times C_{out} \times (C_{in} \times k \times k)
$$

工程口诀：**下采样换速度、1×1 降维换算力、3×3 换精度**。
选 yolo26n 还是 yolo26x，本质是在这张算力表上做取舍（见 `backbone.scale`）。

### 4. 激活函数（简述）

卷积是线性运算，必须配激活引入非线性：

| 激活 | 特点 | 出现在 |
|------|------|--------|
| ReLU | max(0,x)，快，但负区死亡 | AlexNet/ResNet |
| LeakyReLU | 负区给小斜率 | YOLOv2/v3 |
| Mish | x·tanh(softplus(x))，平滑 | YOLOv4 |
| SiLU / Swish | x·sigmoid(x)，YOLO 默认 | YOLOv5/v8/v11/v26 |

YOLO 系列默认 **SiLU**：平滑、非单调，实测比 ReLU 稳，导出兼容性也好。

### 5. 池化与降采样

- **最大池化**：取局部最大，保留纹理/边缘，对平移鲁棒。
- **平均池化**：取局部均值，常见于分类头末尾（全局平均池化 GAP）。
- **趋势**：现代网络（含 YOLO）更常用 **stride=2 的卷积** 做下采样——可学习、效果好，
  池化多用在 SPP/SPPF 这种固定感受野聚合的地方。

### 6. BatchNorm（批归一化）

每个通道按 batch 统计量归一化：$\hat{x} = (x-\mu)/\sqrt{\sigma^2+\epsilon} \cdot \gamma + \beta$。

- 训练时用 batch 均值/方差，推理时用运行统计量（running_mean/var）
- **作用**：加速收敛、允许更大学习率、轻微正则化
- **工程要点**：导出 TensorRT/ONNX 时通常把 Conv+BN **融合**成一个 Conv，`model.fuse()` 就是干这个的

### 7. 经典演进（与 YOLO 的渊源）

```
LeNet (1998)      卷积+池化+全连接的原型
   ↓
AlexNet (2012)    ReLU / Dropout / GPU 训练，深度学习复兴
   ↓
VGG (2014)        3×3 小核堆叠，深度=宽度的朴素方案
   ↓
ResNet (2015)     残差连接，解决深层退化 → Darknet-53 的残差块来源
   ↓
CSPNet (2020)     跨阶段局部连接，拆分梯度流 → YOLOv4~v8 骨干核心
   ↓
C3 / C2f / C3k2   YOLO 家族的 CSP 实现变体（见 backbone 域）
```

残差块（BasicBlock）思想：$y = F(x) + x$，让梯度可以跨层直传，
这是 Darknet-53、E-ELAN 等「深而稳」结构的基础。

### 8. PyTorch 最小示例

```python
import torch
import torch.nn as nn

class CBS(nn.Module):
    """Conv + BN + SiLU —— YOLO 最基础积木"""
    def __init__(self, c_in, c_out, k=3, s=1, p=None):
        super().__init__()
        if p is None:
            p = k // 2
        self.conv = nn.Conv2d(c_in, c_out, k, s, p, bias=False)
        self.bn = nn.BatchNorm2d(c_out)
        self.act = nn.SiLU(inplace=True)

    def forward(self, x):
        return self.act(self.bn(self.conv(x)))

x = torch.randn(1, 3, 640, 640)      # B, C, H, W
m = CBS(3, 16, s=2)                  # 降采样一半
print(m(x).shape)                    # -> (1, 16, 320, 320)
```

### 9. YOLO 里的常见卷积变体

| 积木 | 结构 | 用途 |
|------|------|------|
| CBS | Conv+BN+SiLU | 一切基础 |
| Bottleneck | 1×1 降维 → 3×3 → 1×1 升维（+残差） | 控算力 |
| C3 | 两支路（Bottleneck 堆叠）+ concat | YOLOv5/v8 骨干 |
| C2f | 更宽的梯度分支拼接 | YOLOv8 |
| DWConv | 逐通道 3×3 + 1×1 混合（深度可分离） | MobileNet 系、轻量化 |
| SPPF | 多尺度最大池化串行 | 聚合感受野 |

## 常见坑

1. **算输出尺寸忘了 padding**：部署前后处理对不上，框全偏。手算一遍
   $\lfloor(H+2p-k)/s\rfloor+1$，或用 `torchsummary` / `model.info()` 核对。
2. **把「特征图大小」当「感受野」**：3×3 堆两层，输出一个点「看到」的输入区域是 5×5，
   不是 3×3。小目标检测要关注有效感受野（见 `foundation.receptive`）。
3. **1×1 卷积不能提取空间特征**：只做通道融合，别指望它捕捉形状。
4. **BN 忘了切 eval 模式**：`model.eval()` 才用 running stats；
   PyTorch 训练/推理模式混用是「训练 90 mAP、部署 30 mAP」经典事故。
5. **Conv+BN 未融合就量化**：TensorRT INT8 前先 `model.fuse()`，否则校准统计失真。
6. **下采样太狠丢小目标**：连续 stride=2 三层，小目标只剩 1 个像素响应。
   小目标场景考虑 P2 输出（更高分辨率特征层）或控制下采样次数。
7. **padding 引入的伪影**：边缘补 0 会带来边界效应；对掩码/深度这类像素级任务更敏感，
   有时要留意 `padding_mode`。

## 延伸与关联

- **紧接着学**：`foundation.receptive`（感受野与特征图）—— 理解「堆叠的意义」
- **骨干演进**：`backbone.darknet` → `backbone.cspnet` → `backbone.c3` → `backbone.c2f`
- **激活与归一化的取舍**：SiLU 与 BN 在 `backbone` 各积木中的位置
- **轻量化方向**：DWConv / ShuffleNet / MobileNet（对应 `deploy.compression`）
- **动手练习**：
  1. 用上面的 CBS 搭一个 4 层小骨干，打印每层输出形状；
  2. 计算该骨干参数量与 FLOPs；
  3. 把 stride=2 换成 MaxPool2d(2)，对比 `model.info()`。
