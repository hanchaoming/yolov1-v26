# YOLO 知识图谱 · 架构设计

> 目标：构建 YOLO v1→YOLO26 全谱系知识图谱，覆盖目标检测 / 实例分割 / 语义分割 / 深度估计
> 与 C++ / TensorRT / RKNN 部署轻量化，支撑「2D 视觉项目胸有成竹」的学习目标。

## 1. 风格锚点与产品定位

- **风格锚点**：Heptabase 白板卡片 + Obsidian 局部图 + 思源笔记中文排版。
- **一句话定位**：一个「边看图、边学、边记进度」的 YOLO 领域私人知识地图。
- **信息密度**：左树导航常驻，中间图谱是主角，右侧卡片承载正文；不做营销式大图。

## 2. 视觉系统

| 角色 | 色值 | 用途 |
|------|------|------|
| 背景 | `#0F1419` | 深色画布（图谱阅读友好） |
| 面板 | `#1A2029` | 侧栏 / 详情面板 |
| 主墨 | `#E6EDF3` | 正文 |
| 次墨 | `#8B98A5` | 标注 / 辅助 |
| 强调 | `#3B82F6` | 选中、主按钮、时间线主轴 |
| 领域色 | 检测 `#3B82F6` / 分割 `#22C55E` / 深度 `#A855F7` / 部署 `#F59E0B` / 基础 `#64748B` / 训练 `#06B6D4` | 节点着色 |

- **字体**：系统栈 `-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif`；正文 14px / 行高 1.75；标题 16–20px。
- **圆角**：卡片 10px，节点 8px；间距 8px 栅格。

## 3. 信息架构（11 个知识域 · 107 个知识点）

```
foundation 基础理论 ──► evolution 版本演进 (v1→v26 时间主轴)
        │                      │
        ▼                      ▼
backbone / neck / head / loss  架构组件层
        │                      │
        ▼                      ▼
   train / eval  ◄────────►  task 任务层 (detect / inst-seg / sem-seg / depth)
        │                      │
        └──────────┬───────────┘
                   ▼
        deploy 部署与轻量化 (ONNX / TensorRT / RKNN / C++)
                   ▼
        practice 项目实战 (2D 视觉项目全流程)
```

### 节点类型
`concept 概念` / `version 版本` / `technique 技巧` / `tool 工具` / `task 任务` / `practice 实战`

### 边类型
- `prereq` 先修关系（学习路径依据）
- `evolved` 演进关系（v1→v2→…→v26）
- `part_of` 组成关系（backbone→neck→head）
- `improves` 改进关系（CSPDarknet 改进自 Darknet）
- `uses` 使用关系
- `related` 相关

## 4. 技术选型

| 层 | 选型 | 理由 |
|----|------|------|
| 前端 | React 18 + Vite + TypeScript | 生态成熟、HMR 快 |
| 图谱引擎 | AntV G6 5.x | 中文文档、组合(combo)、力导向/dagre/时间线布局、交互行为内置 |
| UI | Ant Design 5 | 中文组件齐全（树、抽屉、标签） |
| 状态 | Zustand | 轻量 |
| 正文渲染 | react-markdown + remark-gfm | 知识正文用 Markdown 维护 |
| 后端 | FastAPI (Python) | 与 YOLO/Python 生态同侧、自文档 API |
| 数据 | YAML 节点 + Markdown 正文（文件为源） + SQLite 进度 | 知识内容可被作者直接编辑、git 版本化 |
| 进度存储 | SQLite（`backend/data/progress.db`） | 跨浏览器保留学习进度 |

**否决方案**：vis-network（交互陈旧）、cytoscape（暗色/组合需手写）、ECharts graph（图交互弱）、Neo4j（过重）、纯静态（无进度持久化）。

## 5. 页面布局

```
┌──────────────────────────────────────────────────────────────┐
│ TOP: [搜索 Ctrl+K] [任务筛选] [域筛选] [布局:力导向|时间线] [进度]│
├──────────┬──────────────────────────────────┬────────────────┤
│ 左侧树    │ 中间画布 (G6)                     │ 右侧详情        │
│ 学习路径   │  • 力导向：域着色 + 选中1跳聚焦     │ 标题/难度/标签   │
│ 领域导航   │  • 时间线：v1→v26 横向演进主轴     │ Markdown 正文   │
│ 进度统计   │  • 顶点可拖拽/缩放/双击展开        │ 先修/后继/相关   │
└──────────┴──────────────────────────────────┴────────────────┘
```

## 6. 数据契约

### 节点 (YAML)
```yaml
id: yolo.v8            # 稳定 ID，点分命名
label: YOLOv8
domain: evolution      # 域
type: version          # 类型
year: 2023
tasks: [detect, inst_seg, pose, obb]
difficulty: 2          # 1-3
summary: 一句话摘要
tags: [anchor-free, decoupled-head, TAL]
content: content/yolo.v8.md
order: 8
```

### 边 (YAML)
```yaml
- source: yolo.v7
  target: yolo.v8
  type: evolved
  label: 演进为
```

### API
```
GET  /api/graph            → {nodes, edges, domains}
GET  /api/node/{id}        → 节点详情 + markdown 正文
GET  /api/search?q=        → 节点搜索
GET  /api/progress         → {node_id: status}
PUT  /api/progress/{id}    → {status: unlearned|learning|learned}
GET  /api/stats            → 域进度统计
```

## 7. 交付物

```
yolo-knowledge-graph/
├── DESIGN.md
├── README.md                # 使用说明
├── backend/                 # FastAPI + YAML 数据层
│   ├── app/
│   ├── data/
│   │   ├── nodes.yaml       # 107 个知识点
│   │   ├── edges.yaml       # 学习路径/演进/组成边
│   │   └── content/         # 节点正文 Markdown
│   └── requirements.txt
├── frontend/                # React + Vite + G6
└── start.ps1                # 一键启动
```

## 8. 学习路径（图谱内嵌）

1. **打地基**：foundation 全部 → eval 指标
2. **顺脉络**：evolution 时间线 v1→v26（每个版本的「改了什么」）
3. **拆架构**：backbone / neck / head / loss 四大组件
4. **进任务**：detect → inst-seg → sem-seg → depth（含对比）
5. **上工程**：deploy（ONNX→TensorRT→RKNN→C++）→ train 调优
6. **落实战**：practice 项目全流程，反查图谱组装方案

## 9. 内容策略

- 每个节点：`summary`（一句话）+ `content`（Markdown：是什么/为什么/怎么用/常见坑/延伸）
- 数字与版本事实以 Ultralytics 官方文档为准（2026-11 核实）
- 作者后续逐节充实正文；缺省正文由后端自动生成学习骨架
