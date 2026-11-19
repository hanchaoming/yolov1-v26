# YOLO 知识图谱（v1 → YOLO26）

面向 2D 视觉项目实战的 YOLO 领域知识地图：前后端分离，图谱可视化学习，
覆盖 **目标检测 / 实例分割 / 语义分割 / 深度估计** 与 **C++ · TensorRT · RKNN 部署轻量化**。

## 快速开始

```powershell
# Windows 一键启动（后端 8000 + 前端 5173）
.\start.ps1
```

浏览器打开 <http://127.0.0.1:5173/>

### 手动启动

```powershell
# 1) 后端
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 2) 前端（另开终端）
cd frontend
npm install
npm run dev
```

## 目录结构

```
yolo-knowledge-graph/
├── DESIGN.md               # 架构与视觉设计
├── README.md
├── start.ps1
├── backend/                # FastAPI
│   ├── app/
│   │   ├── main.py         # REST API
│   │   └── loader.py       # YAML 图谱加载 + 进度 SQLite
│   └── data/
│       ├── domains.yaml    # 11 个知识域
│       ├── nodes/*.yaml    # 110 个知识点
│       ├── edges.yaml      # 先修 / 演进 / 组成 / 相关
│       └── content/        # 节点正文 Markdown（缺失自动生成骨架）
└── frontend/               # React + Vite + AntV G6
    └── src/
        ├── App.tsx
        ├── components/     # GraphCanvas / Sidebar / DetailPanel
        └── store.ts
```

## 功能

- **图谱画布**：力导向 / 时间线（v1→v26）双布局，域着色，选中节点高亮
- **任务筛选**：检测 / 实例分割 / 语义分割 / 深度估计
- **学习路径**：左栏按域与顺序排列，点击跳转
- **节点详情**：Markdown 正文（GFM 表格、代码块），先修 / 后继 / 相关跳转
- **进度管理**：未学 / 在学 / 已掌握，SQLite 持久化，按域统计
- **搜索**：Ctrl+K 全局搜索

## 如何充实知识内容

正文是 Markdown，直接编辑 `backend/data/content/<节点id>.md` 即可；
后端重启（或重新请求）后生效。新增知识点：

1. 在 `backend/data/nodes/` 对应域的 YAML 中追加节点
2. 在 `backend/data/edges.yaml` 中补关系（`prereq` / `evolved` / `part_of` / `improves` / `uses` / `related`）
3. （可选）在 `backend/data/content/` 写正文；不写则自动生成学习骨架

## API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/graph` | 全图节点与边 |
| GET | `/api/node/{id}` | 节点详情 + 正文 + 关联 |
| GET | `/api/search?q=` | 搜索 |
| GET | `/api/path` | 学习路径 |
| GET/PUT | `/api/progress` | 学习进度 |
| GET | `/api/stats` | 域统计 |

## 学习建议

1. **打地基**：基础理论 → 评估指标
2. **顺脉络**：版本演进 v1 → YOLO26（重点 v8 / v10 / v26）
3. **拆架构**：骨干 / 颈部 / 检测头 / 损失分配
4. **进任务**：检测 → 实例分割 → 语义分割 → 深度估计
5. **上工程**：ONNX → TensorRT → RKNN → C++ 通用范式
6. **落实战**：项目全流程 + 常见坑清单

> 他山之石，可以攻玉 —— 用图谱把散落的经验连成体系，遇到项目按域反查，胸有成竹。
