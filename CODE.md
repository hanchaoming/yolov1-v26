# YOLO 知识图谱 · 全部代码汇总

> 项目：`yolo-knowledge-graph`（前后端分离）
> 说明：本文汇总可运行源码与数据文件。`backend/data/content/` 下未列出的节点正文由后端自动生成学习骨架。

## 目录结构

```
yolo-knowledge-graph/
├── start.ps1                       # Windows 一键启动
├── backend/
│   ├── requirements.txt
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI 路由
│   │   └── loader.py               # YAML 图谱加载 + SQLite 进度
│   └── data/
│       ├── domains.yaml            # 11 个知识域
│       ├── nodes/01~11-*.yaml      # 110 个知识点
│       ├── edges.yaml              # 146 条关系
│       └── content/*.md            # 节点正文
└── frontend/
    ├── package.json / vite.config.ts / tsconfig.json / index.html
    └── src/
        ├── main.tsx / App.tsx / store.ts / api.ts / types.ts / styles.css
        └── components/GraphCanvas.tsx / Sidebar.tsx / DetailPanel.tsx
```

---

## 1. 启动脚本

### `start.ps1`

```powershell
# YOLO 知识图谱一键启动（Windows）
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$py = if ($env:MIMO_PYTHON) { $env:MIMO_PYTHON } else { "python" }

Write-Host "==> 启动后端 (127.0.0.1:8000)" -ForegroundColor Cyan
Start-Process -FilePath $py -ArgumentList "-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8000" -WorkingDirectory "$root\backend" -WindowStyle Hidden

Write-Host "==> 启动前端 (127.0.0.1:5173)" -ForegroundColor Cyan
Start-Process -FilePath "cmd" -ArgumentList "/c","npm run dev" -WorkingDirectory "$root\frontend" -WindowStyle Hidden

Start-Sleep -Seconds 5
Write-Host ""
Write-Host "  后端 API : http://127.0.0.1:8000/api/health" -ForegroundColor Green
Write-Host "  前端页面 : http://127.0.0.1:5173/" -ForegroundColor Green
Write-Host ""
Write-Host "  （本窗口可关闭，服务在后台运行）"
Start-Process "http://127.0.0.1:5173/"
```

---

## 2. 后端（FastAPI）

### `backend/requirements.txt`

```text
fastapi>=0.110
uvicorn>=0.29
pyyaml>=6.0
pydantic>=2.6
```

### `backend/app/__init__.py`

```python
```

### `backend/app/loader.py`

```python
"""YOLO 知识图谱 · 数据加载层。

从 data/ 目录读取 domains.yaml、nodes/*.yaml、edges.yaml，
并在内存中编译为图谱结构；节点正文缺失时自动生成学习骨架。
"""
from __future__ import annotations

import sqlite3
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
CONTENT_DIR = DATA_DIR / "content"
PROGRESS_DB = DATA_DIR / "progress.db"

VALID_STATUS = ("unlearned", "learning", "learned")


def _load_yaml(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _scaffold(node: dict) -> str:
    """正文缺失时生成学习骨架，便于作者逐节充实。"""
    return (
        f"# {node['label']}\n\n"
        f"> {node.get('summary', '')}\n\n"
        f"## 这是什么\n\n"
        f"（待补充：用一两段话说清定义与它在 YOLO 体系中的位置）\n\n"
        f"## 为什么需要它\n\n"
        f"（待补充：解决什么问题？没有它会怎样？）\n\n"
        f"## 怎么用 / 关键细节\n\n"
        f"（待补充：公式、配置、代码片段、超参经验）\n\n"
        f"## 常见坑\n\n"
        f"（待补充：容易踩的误区与排查思路）\n\n"
        f"## 延伸与关联\n\n"
        f"（待补充：对比其他方案、进一步阅读）\n"
    )


def _ensure_content(node: dict) -> str:
    name = f"{node['id']}.md"
    path = CONTENT_DIR / name
    if not path.exists():
        CONTENT_DIR.mkdir(parents=True, exist_ok=True)
        text = _scaffold(node)
        path.write_text(text, encoding="utf-8")
        return text
    return path.read_text(encoding="utf-8")


class GraphStore:
    def __init__(self) -> None:
        self.domains: list[dict] = []
        self.nodes: dict[str, dict] = {}
        self.edges: list[dict] = []
        self._load()
        self._init_db()

    def _load(self) -> None:
        self.domains = _load_yaml(DATA_DIR / "domains.yaml").get("domains", [])
        self.nodes = {}
        for path in sorted((DATA_DIR / "nodes").glob("*.yaml")):
            items = _load_yaml(path)
            if isinstance(items, list):
                for node in items:
                    self.nodes[node["id"]] = node
        self.edges = _load_yaml(DATA_DIR / "edges.yaml")
        if not isinstance(self.edges, list):
            self.edges = []
        # 过滤悬空边
        self.edges = [
            e for e in self.edges
            if e.get("source") in self.nodes and e.get("target") in self.nodes
        ]

    def _init_db(self) -> None:
        PROGRESS_DB.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(PROGRESS_DB) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS progress (
                    node_id TEXT PRIMARY KEY,
                    status  TEXT NOT NULL DEFAULT 'unlearned',
                    updated TEXT DEFAULT (datetime('now'))
                )
                """
            )

    # ── 查询 ─────────────────────────────────────
    def graph(self) -> dict:
        nodes = []
        for n in self.nodes.values():
            nodes.append({
                "id": n["id"],
                "label": n["label"],
                "domain": n["domain"],
                "type": n.get("type", "concept"),
                "year": n.get("year"),
                "tasks": n.get("tasks", []),
                "tags": n.get("tags", []),
                "difficulty": n.get("difficulty", 2),
                "summary": n.get("summary", ""),
                "order": n.get("order", 0),
            })
        nodes.sort(key=lambda x: (x["domain"], x["order"]))
        return {
            "nodes": nodes,
            "edges": list(self.edges),
            "domains": self.domains,
        }

    def node_detail(self, node_id: str) -> dict | None:
        n = self.nodes.get(node_id)
        if not n:
            return None
        out = dict(n)
        out["content"] = _ensure_content(n)
        out["content_file"] = f"content/{node_id}.md"
        # 关联节点
        related = {"prereq": [], "next": [], "related": []}
        for e in self.edges:
            if e["source"] == node_id:
                tgt = self.nodes.get(e["target"])
                if tgt:
                    item = {"id": tgt["id"], "label": tgt["label"], "type": e.get("type"),
                            "label_zh": e.get("label", "")}
                    if e.get("type") == "prereq":
                        related["next"].append(item)
                    else:
                        related["related"].append(item)
            elif e["target"] == node_id:
                src = self.nodes.get(e["source"])
                if src and e.get("type") == "prereq":
                    related["prereq"].append(
                        {"id": src["id"], "label": src["label"], "type": "prereq",
                         "label_zh": e.get("label", "")}
                    )
                elif src:
                    related["related"].append(
                        {"id": src["id"], "label": src["label"], "type": e.get("type"),
                         "label_zh": e.get("label", "")}
                    )
        out["related"] = related
        return out

    def search(self, q: str, limit: int = 20) -> list[dict]:
        q = q.strip().lower()
        if not q:
            return []
        hits = []
        for n in self.nodes.values():
            hay = " ".join([
                n["id"], n["label"], n.get("summary", ""),
                " ".join(n.get("tags", [])), n["domain"],
            ]).lower()
            if q in hay:
                hits.append({
                    "id": n["id"], "label": n["label"], "domain": n["domain"],
                    "summary": n.get("summary", ""),
                })
            if len(hits) >= limit:
                break
        return hits

    def path(self) -> list[dict]:
        """学习路径：按 domain 顺序 + order 排序。"""
        order_map = {d["id"]: i for i, d in enumerate(self.domains)}
        items = sorted(
            self.nodes.values(),
            key=lambda n: (order_map.get(n["domain"], 99), n.get("order", 0)),
        )
        return [{"id": n["id"], "label": n["label"], "domain": n["domain"],
                 "summary": n.get("summary", "")} for n in items]

    # ── 进度 ─────────────────────────────────────
    def progress(self) -> dict[str, str]:
        with sqlite3.connect(PROGRESS_DB) as conn:
            rows = conn.execute("SELECT node_id, status FROM progress").fetchall()
        return {r[0]: r[1] for r in rows}

    def set_progress(self, node_id: str, status: str) -> dict:
        if node_id not in self.nodes:
            raise KeyError(node_id)
        if status not in VALID_STATUS:
            raise ValueError(status)
        with sqlite3.connect(PROGRESS_DB) as conn:
            conn.execute(
                "INSERT INTO progress (node_id, status) VALUES (?, ?) "
                "ON CONFLICT(node_id) DO UPDATE SET status=excluded.status, "
                "updated=datetime('now')",
                (node_id, status),
            )
        return {"id": node_id, "status": status}

    def stats(self) -> dict:
        prog = self.progress()
        by_domain: dict[str, dict] = {}
        for d in self.domains:
            by_domain[d["id"]] = {"label": d["label"], "total": 0,
                                  "learned": 0, "learning": 0, "unlearned": 0}
        for n in self.nodes.values():
            bucket = by_domain.setdefault(
                n["domain"], {"label": n["domain"], "total": 0,
                              "learned": 0, "learning": 0, "unlearned": 0}
            )
            bucket["total"] += 1
            st = prog.get(n["id"], "unlearned")
            bucket[st] = bucket.get(st, 0) + 1
        total = len(self.nodes)
        learned = sum(1 for v in prog.values() if v == "learned")
        return {
            "total": total,
            "learned": learned,
            "learning": sum(1 for v in prog.values() if v == "learning"),
            "percent": round(learned * 100 / total, 1) if total else 0,
            "domains": by_domain,
        }


@lru_cache(maxsize=1)
def get_store() -> GraphStore:
    return GraphStore()
```

### `backend/app/main.py`

```python
"""YOLO 知识图谱 · FastAPI 服务。"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .loader import get_store

app = FastAPI(title="YOLO Knowledge Graph API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ProgressBody(BaseModel):
    status: str


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/graph")
def graph() -> dict:
    return get_store().graph()


@app.get("/api/node/{node_id}")
def node(node_id: str) -> dict:
    detail = get_store().node_detail(node_id)
    if not detail:
        raise HTTPException(404, f"node not found: {node_id}")
    return detail


@app.get("/api/search")
def search(q: str = Query("", max_length=64)) -> dict:
    return {"results": get_store().search(q)}


@app.get("/api/path")
def learning_path() -> dict:
    return {"path": get_store().path()}


@app.get("/api/progress")
def read_progress() -> dict:
    return get_store().progress()


@app.put("/api/progress/{node_id}")
def write_progress(node_id: str, body: ProgressBody) -> dict:
    try:
        return get_store().set_progress(node_id, body.status)
    except KeyError:
        raise HTTPException(404, f"node not found: {node_id}")
    except ValueError:
        raise HTTPException(400, "status must be unlearned|learning|learned")


@app.get("/api/stats")
def stats() -> dict:
    return get_store().stats()
```

---

## 3. 数据层（YAML）

### `backend/data/domains.yaml`

```yaml
# 知识域定义
domains:
  - id: foundation
    label: 基础理论
    color: "#64748B"
    description: 目标检测与卷积网络的前置概念
  - id: evolution
    label: 版本演进
    color: "#3B82F6"
    description: YOLO v1 → YOLO26 时间主轴
  - id: backbone
    label: 骨干网络
    color: "#0EA5E9"
    description: 特征提取器
  - id: neck
    label: 特征融合
    color: "#06B6D4"
    description: 多尺度特征金字塔
  - id: head
    label: 检测头
    color: "#8B5CF6"
    description: 预测输出层
  - id: loss
    label: 损失与分配
    color: "#EC4899"
    description: 损失函数与标签分配
  - id: task
    label: 任务专题
    color: "#22C55E"
    description: 检测 / 实例分割 / 语义分割 / 深度估计
  - id: train
    label: 训练调优
    color: "#14B8A6"
    description: 数据、增强、超参、监控
  - id: eval
    label: 评估指标
    color: "#F59E0B"
    description: 精度、速度、任务指标
  - id: deploy
    label: 部署轻量化
    color: "#EF4444"
    description: ONNX / TensorRT / RKNN / C++
  - id: practice
    label: 项目实战
    color: "#F97316"
    description: 2D 视觉项目全流程
```

### `backend/data/nodes/01-foundation.yaml`

```yaml
# 基础理论
- id: foundation.conv
  label: 卷积与CNN基础
  domain: foundation
  type: concept
  difficulty: 1
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [cnn, conv, pooling]
  order: 1
  summary: 卷积层提取局部特征、池化降采样、堆叠形成层级感受野，是一切检测骨干的原子单元。
- id: foundation.receptive
  label: 感受野与特征图
  domain: foundation
  type: concept
  difficulty: 2
  tasks: [detect]
  tags: [receptive-field, feature-map]
  order: 2
  summary: 感受野决定网络「能看到」多大范围；深层特征图分辨率低但语义强，浅层分辨率高但语义弱。
- id: foundation.detect_def
  label: 目标检测问题定义
  domain: foundation
  type: concept
  difficulty: 1
  tasks: [detect]
  tags: [one-stage, two-stage]
  order: 3
  summary: 在图像中定位（框）并分类目标；两阶段先提议后精修，一阶段（YOLO）直接回归，速度占优。
- id: foundation.iou
  label: IoU 与框重叠度
  domain: foundation
  type: concept
  difficulty: 1
  tasks: [detect]
  tags: [iou, metric]
  order: 4
  summary: 预测框与真值框交并比，是 NMS、标签分配、损失函数与 mAP 的共同基石。
- id: foundation.nms
  label: NMS 非极大值抑制
  domain: foundation
  type: concept
  difficulty: 2
  tasks: [detect, inst_seg]
  tags: [nms, postprocess]
  order: 5
  summary: 按置信度排序、剔除高重叠框，保留最优检测；YOLO26 可选 NMS-free 端到端输出。
- id: foundation.anchor
  label: Anchor 先验框
  domain: foundation
  type: concept
  difficulty: 2
  tasks: [detect]
  tags: [anchor, anchor-free]
  order: 6
  summary: 预设参考框加速收敛；YOLOv8 起走向 anchor-free，直接回归框偏移与中心度。
- id: foundation.map
  label: mAP 评价指标
  domain: foundation
  type: concept
  difficulty: 2
  tasks: [detect, inst_seg]
  tags: [map, precision, recall]
  order: 7
  summary: PR 曲线下面积的类别平均；COCO 常用 mAP@0.5:0.95，是跨版本对比的通用标尺。
- id: foundation.dataset
  label: 主流数据集 COCO / VOC
  domain: foundation
  type: concept
  difficulty: 1
  tasks: [detect, inst_seg, sem_seg]
  tags: [coco, voc, cityscapes, ade20k]
  order: 8
  summary: COCO 80 类通用检测/分割；Cityscapes/ADE20K 用于语义分割；NYU/KITTI 用于深度估计。
```

### `backend/data/nodes/02-evolution.yaml`

```yaml
# 版本演进（时间主轴 v1 → YOLO26）
- id: yolo.v1
  label: YOLOv1
  domain: evolution
  type: version
  year: 2015
  difficulty: 2
  tasks: [detect]
  tags: [grid, one-stage, unified]
  order: 1
  summary: 2015 年 Redmon 等提出统一单阶段检测器，把检测化为一次回归，45 FPS / 63.4 mAP(VOC07)。
- id: yolo.v2
  label: YOLOv2 / YOLO9000
  domain: evolution
  type: version
  year: 2016
  difficulty: 2
  tasks: [detect]
  tags: [anchor, bn, darknet19, multi-scale]
  order: 2
  summary: 引入 BatchNorm、Anchor 聚类、Darknet-19、多尺度训练，WordTree 联合 9000 类。
- id: yolo.v3
  label: YOLOv3
  domain: evolution
  type: version
  year: 2018
  difficulty: 2
  tasks: [detect]
  tags: [darknet53, fpn, multi-scale-head]
  order: 3
  summary: Darknet-53 残差骨干 + FPN 三尺度预测头，多标签逻辑回归，小目标显著改善。
- id: yolo.v4
  label: YOLOv4
  domain: evolution
  type: version
  year: 2020
  difficulty: 3
  tasks: [detect]
  tags: [cspdarknet, spp, pan, bag-of-freebies]
  order: 4
  summary: CSPDarknet-53 + SPP + PAN，系统整理「免费包」与「技巧包」，43.5 AP / 65.2 AP50。
- id: yolo.v5
  label: YOLOv5
  domain: evolution
  type: version
  year: 2020
  difficulty: 2
  tasks: [detect]
  tags: [pytorch, ultralytics, ecosystem, autoanchor]
  order: 5
  summary: Ultralytics PyTorch 生态化改写：Focus/CSP、PANet、Mosaic、autoanchor、完整导出链路。
- id: yolo.v6
  label: YOLOv6
  domain: evolution
  type: version
  year: 2022
  difficulty: 3
  tasks: [detect]
  tags: [meituan, efficientrep, reparameterization, quant-friendly]
  order: 6
  summary: 美团出品：EfficientRep/Rep-PAN 结构重参数化，面向工业量化部署，SimOTA→TAL。
- id: yolo.v7
  label: YOLOv7
  domain: evolution
  type: version
  year: 2022
  difficulty: 3
  tasks: [detect]
  tags: [e-elan, aux-head, reparameterization]
  order: 7
  summary: E-ELAN 扩展梯度连接 + 辅助头引导标签分配，51.4 AP @161 FPS，精度-速度双优。
- id: yolo.v8
  label: YOLOv8
  domain: evolution
  type: version
  year: 2023
  difficulty: 2
  tasks: [detect, inst_seg, classify, pose, obb]
  tags: [anchor-free, c2f, decoupled-head, TAL, DFL]
  order: 8
  summary: Ultralytics 里程碑：anchor-free + C2f + 解耦头 + TAL/DFL，统一五任务 API。
- id: yolo.v9
  label: YOLOv9
  domain: evolution
  type: version
  year: 2024
  difficulty: 3
  tasks: [detect, inst_seg]
  tags: [PGI, GELAN, gradient-info]
  order: 9
  summary: PGI 可编程梯度信息对抗信息瓶颈，GELAN 广义高效层聚合，YOLOv9-E 达 55.6 AP。
- id: yolo.v10
  label: YOLOv10
  domain: evolution
  type: version
  year: 2024
  difficulty: 3
  tasks: [detect]
  tags: [nms-free, dual-assign, thuly, efficiency]
  order: 10
  summary: 清华 THU-MIG：一致性双分配（一对多训练 + 一对一推理）实现 NMS-free 端到端。
- id: yolo11
  label: YOLO11
  domain: evolution
  type: version
  year: 2024
  difficulty: 2
  tasks: [detect, inst_seg, classify, pose, obb]
  tags: [c3k2, c2psa, stable, production]
  order: 11
  summary: C3k2 + C2PSA 注意力，成熟稳定的生产首选；同精度下比 v8 参数量少约 22%。
- id: yolo12
  label: YOLO12
  domain: evolution
  type: version
  year: 2025
  difficulty: 3
  tasks: [detect, inst_seg, classify, pose, obb]
  tags: [attention-centric, area-attention, r-elan]
  order: 12
  summary: 注意力中心化：Area Attention + R-ELAN，社区研究版，预训练权重仅检测，注意训练稳定性。
- id: yolo26
  label: YOLO26
  domain: evolution
  type: version
  year: 2026
  difficulty: 3
  tasks: [detect, inst_seg, sem_seg, depth, classify, pose, obb]
  tags: [nms-free, no-dfl, musgd, progloss, stal, edge]
  order: 13
  summary: 2026.01 发布：可选 NMS-free 端到端、去 DFL、MuSGD 优化器，首个七任务统一系列。
- id: yolo27
  label: YOLO27（预览）
  domain: evolution
  type: version
  year: 2026
  difficulty: 3
  tasks: [detect, inst_seg, sem_seg, depth, classify, pose, obb]
  tags: [preview, waitlist]
  order: 14
  summary: Ultralytics 候补名单中的下一代，官方预告七任务与 42.3% mAP，权重尚未发布。
- id: yolo.v4_legacy
  label: YOLOv4（Darknet 版）
  domain: evolution
  type: version
  year: 2020
  difficulty: 3
  tasks: [detect]
  tags: [darknet, reference-only]
  order: 15
  summary: Bochkovskiy 的 Darknet 原生实现；Ultralytics 包仅作架构参考，不提供权重。
- id: ecosystem.rtdetr
  label: RT-DETR
  domain: evolution
  type: technique
  year: 2023
  difficulty: 3
  tasks: [detect]
  tags: [transformer, detr, baidu]
  order: 16
  summary: 百度实时 DETR：卷积骨干 + 混合 Transformer 编码器，NMS-free，精度上限高。
- id: ecosystem.openvocab
  label: YOLO-World / YOLOE 开放词汇
  domain: evolution
  type: technique
  year: 2024
  difficulty: 3
  tasks: [detect, inst_seg]
  tags: [open-vocabulary, text-prompt, visual-prompt]
  order: 17
  summary: 文本/视觉提示或无提示的开放世界检测分割，突破固定类别，YOLOE-26 已并入 YOLO26 系列。
- id: ecosystem.sam
  label: SAM 系列提示式分割
  domain: evolution
  type: technique
  year: 2023
  difficulty: 2
  tasks: [inst_seg]
  tags: [sam, sam2, sam3, promptable, auto-annotation]
  order: 18
  summary: Meta SAM/SAM2/SAM3 与 MobileSAM/FastSAM，点/框/文本提示分割，常用于自动标注。
```

### `backend/data/nodes/03-backbone.yaml`

```yaml
# 骨干网络
- id: backbone.darknet
  label: Darknet / Darknet-19 / Darknet-53
  domain: backbone
  type: concept
  difficulty: 2
  tasks: [detect]
  tags: [darknet, residual, yolo1, yolo2, yolo3]
  order: 1
  summary: YOLOv1-v3 的骨干家族；Darknet-53 用残差堆叠，在精度与算力间取得平衡。
- id: backbone.cspnet
  label: CSPNet
  domain: backbone
  type: concept
  difficulty: 2
  tasks: [detect]
  tags: [csp, gradient-flow, efficient]
  order: 2
  summary: 跨阶段局部连接分割梯度流，降低计算量并保持精度，是 YOLOv4-v8 骨干核心思想。
- id: backbone.c3
  label: C3 / Bottleneck
  domain: backbone
  type: concept
  difficulty: 2
  tasks: [detect, inst_seg]
  tags: [c3, bottleneck, yolo5, yolo8]
  order: 3
  summary: CSP 思想的标准实现：两条支路（含 Bottleneck 堆叠）拼接融合，v5/v8 基础积木。
- id: backbone.c2f
  label: C2f / C3k2
  domain: backbone
  type: concept
  difficulty: 2
  tasks: [detect, inst_seg]
  tags: [c2f, c3k2, yolo8, yolo11]
  order: 4
  summary: C2f 加宽梯度分支提升特征复用；C3k2（YOLO11）以小核 CSP 变体进一步减参提速。
- id: backbone.elan
  label: ELAN / E-ELAN / GELAN
  domain: backbone
  type: concept
  difficulty: 3
  tasks: [detect]
  tags: [elan, e-elan, gelan, yolo7, yolo9]
  order: 5
  summary: 高效层聚合网络系列：短路连接堆叠增强梯度；GELAN 将其泛化为可组合的通用结构。
- id: backbone.rep
  label: EfficientRep / RepVGG
  domain: backbone
  type: concept
  difficulty: 3
  tasks: [detect]
  tags: [repvgg, reparameterization, yolo6]
  order: 6
  summary: 训练用多分支、推理时重参数化为单路 3×3 卷积，工业部署友好（YOLOv6 主打）。
- id: backbone.spp
  label: SPP / SPPF
  domain: backbone
  type: concept
  difficulty: 2
  tasks: [detect, inst_seg]
  tags: [spp, sppf, receptive-field]
  order: 7
  summary: 空间金字塔池化聚合多尺度感受野；SPPF 串行近似实现，计算更省（v5/v8/v11 标配）。
- id: backbone.attention
  label: PSA / C2PSA 注意力
  domain: backbone
  type: concept
  difficulty: 3
  tasks: [detect]
  tags: [psa, c2psa, attention, yolo11]
  order: 8
  summary: 部分自注意力（PSA）以较低代价引入全局建模，C2PSA 将其封装进 CSP 块（YOLO11）。
- id: backbone.area_attn
  label: Area Attention / R-ELAN
  domain: backbone
  type: concept
  difficulty: 3
  tasks: [detect]
  tags: [area-attention, r-elan, yolo12]
  order: 9
  summary: YOLO12 将大感受野拆分为区域并行注意力，R-ELAN 加残差稳定训练。
- id: backbone.scale
  label: 模型尺度 n/s/m/l/x
  domain: backbone
  type: concept
  difficulty: 1
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [scaling, nano, edge]
  order: 10
  summary: 同架构不同宽度/深度：n 面向边缘，s/m 平衡，l/x 追求精度；工程选型第一决策点。
```

### `backend/data/nodes/04-neck.yaml`

```yaml
# 特征融合（Neck）
- id: neck.fpn
  label: FPN 特征金字塔
  domain: neck
  type: concept
  difficulty: 2
  tasks: [detect, inst_seg]
  tags: [fpn, top-down, multi-scale]
  order: 1
  summary: 自顶向下上采样融合语义与细节，让小目标也能获得强语义特征（YOLOv3 引入）。
- id: neck.pan
  label: PAN / PANet
  domain: neck
  type: concept
  difficulty: 2
  tasks: [detect, inst_seg]
  tags: [pan, panet, bottom-up]
  order: 2
  summary: 在 FPN 之上再加自底向上路径，定位信息回传，YOLOv4/v5/v8 标准颈部。
- id: neck.bifpn
  label: BiFPN
  domain: neck
  type: concept
  difficulty: 3
  tasks: [detect]
  tags: [bifpn, weighted-fusion, efficientdet]
  order: 3
  summary: 双向跨尺度连接 + 可学习加权融合，EfficientDet 提出，融合更充分但略增开销。
- id: neck.reppan
  label: Rep-PAN
  domain: neck
  type: concept
  difficulty: 3
  tasks: [detect]
  tags: [rep-pan, yolo6, reparameterization]
  order: 4
  summary: 用 RepBlock 重参数化改造 PAN，训练多分支、部署单路（YOLOv6）。
- id: neck.fusion
  label: 多尺度融合策略
  domain: neck
  type: concept
  difficulty: 2
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [concat, add, fusion]
  order: 5
  summary: concat 保留信息量、add 融合更轻；P2/P3/P4/P5 层级选择决定小/大目标能力。
- id: neck.attn
  label: 颈部注意力模块
  domain: neck
  type: concept
  difficulty: 3
  tasks: [detect]
  tags: [se, cbam, eca, attention]
  order: 6
  summary: SE/CA/ECBAM 等通道或空间注意力嵌入颈部，提升关键特征响应，代价是少量延迟。
- id: neck.proto
  label: Proto 原型掩码头
  domain: neck
  type: concept
  difficulty: 3
  tasks: [inst_seg]
  tags: [proto, mask, yolo-seg]
  order: 7
  summary: 实例分割通过原型掩码 + 系数线性组合生成实例 mask，YOLO26 升级为多尺度 proto。
```

### `backend/data/nodes/05-head.yaml`

```yaml
# 检测头
- id: head.conv
  label: YOLO 原始检测头
  domain: head
  type: concept
  difficulty: 2
  tasks: [detect]
  tags: [yolo-head, coupled, anchor-based]
  order: 1
  summary: 卷积直接输出 框+置信度+类别，分类回归耦合在一起，v1-v7 主流形态。
- id: head.decoupled
  label: 解耦头 Decoupled Head
  domain: head
  type: concept
  difficulty: 2
  tasks: [detect, inst_seg, pose, obb]
  tags: [decoupled, yolo8, cls-branch, reg-branch]
  order: 2
  summary: 分类与回归分支解耦，各自针对性优化，YOLOv8 起标配，收敛更快更稳。
- id: head.anchor_free
  label: Anchor-free 回归
  domain: head
  type: concept
  difficulty: 2
  tasks: [detect]
  tags: [anchor-free, center, ltrb]
  order: 3
  summary: 直接预测中心偏移与四边距离（ltrb），去掉先验框超参，泛化性更好（v8+）。
- id: head.dfl
  label: DFL 分布式框回归
  domain: head
  type: concept
  difficulty: 3
  tasks: [detect]
  tags: [dfl, distribution, box-regression]
  order: 4
  summary: 把框坐标离散化为分布再期望求解，提升定位细腻度；YOLO26 为兼容性已移除。
- id: head.tal
  label: TAL 任务对齐分配
  domain: head
  type: concept
  difficulty: 3
  tasks: [detect, inst_seg]
  tags: [tal, label-assign, task-aligned]
  order: 5
  summary: 用分类与定位的联合对齐度动态选择正样本，取代手工 IoU 阈值，v8+ 核心机制。
- id: head.nmsfree
  label: NMS-free 头（一致性双分配）
  domain: head
  type: concept
  difficulty: 3
  tasks: [detect]
  tags: [nms-free, dual-assign, yolo10]
  order: 6
  summary: 一对多分支负责训练监督，一对一分支负责推理输出，免 NMS 后处理（YOLOv10）。
- id: head.yolo26
  label: YOLO26 端到端头
  domain: head
  type: concept
  difficulty: 3
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [nms-free, end-to-end, no-dfl, yolo26]
  order: 7
  summary: 可选 NMS-free（≤300 检测/图）+ 去 DFL，导出链路更简洁，CPU 推理提速最高 43%。
- id: head.mask
  label: 掩码头（实例/语义）
  domain: head
  type: concept
  difficulty: 3
  tasks: [inst_seg, sem_seg]
  tags: [mask-head, proto, semantic]
  order: 8
  summary: 实例分割输出 N 个二值 mask；语义分割输出 H×W 类别图，二者结构与指标均不同。
- id: head.depth
  label: 深度头 log-depth
  domain: head
  type: concept
  difficulty: 3
  tasks: [depth]
  tags: [depth-head, log-depth, unbounded, calibrate]
  order: 9
  summary: 预测无界 log 深度（约 0.02–150m），解耦场景形状与绝对尺度，支持 calibrate() 标定。
```

### `backend/data/nodes/06-loss.yaml`

```yaml
# 损失函数与标签分配
- id: loss.cls
  label: 分类损失 BCE / Varifocal
  domain: loss
  type: concept
  difficulty: 2
  tasks: [detect, inst_seg]
  tags: [bce, vfl, classification]
  order: 1
  summary: BCE 是基础；Varifocal 按 IoU 加权正负样本，缓解正负样本不平衡（RT-DETR/YOLOE 常用）。
- id: loss.iou_family
  label: IoU 系列回归损失
  domain: loss
  type: concept
  difficulty: 2
  tasks: [detect]
  tags: [iou, giou, diou, ciou, siou]
  order: 2
  summary: 从 IoU→GIoU→DIoU→CIoU→SIoU 逐步补全重叠、中心距、长宽比与角度信息。
- id: loss.dfl
  label: DFL 损失
  domain: loss
  type: concept
  difficulty: 3
  tasks: [detect]
  tags: [dfl, distribution-focal]
  order: 3
  summary: 分布式焦点损失监督框坐标分布，v8-v12 标配；YOLO26 为硬件兼容性移除。
- id: loss.progloss
  label: ProgLoss 渐进损失
  domain: loss
  type: concept
  difficulty: 3
  tasks: [detect]
  tags: [progloss, yolo26, training-recipe]
  order: 4
  summary: YOLO26 训练配方之一：逐步把监督重心移向推理时实际使用的预测头。
- id: loss.stal
  label: STAL 小目标感知分配
  domain: loss
  type: concept
  difficulty: 3
  tasks: [detect]
  tags: [stal, small-object, label-assign]
  order: 5
  summary: YOLO26 提出的小目标感知标签分配，改善密集微小目标的召回与定位。
- id: loss.assign_legacy
  label: ATSS / SimOTA
  domain: loss
  type: concept
  difficulty: 3
  tasks: [detect]
  tags: [atss, simota, label-assign]
  order: 6
  summary: 动态正样本分配早期代表：ATSS 统计自适应阈值，SimOTA 最优传输匹配（v6 等使用）。
- id: loss.tal
  label: TAL 分配详解
  domain: loss
  type: concept
  difficulty: 3
  tasks: [detect, inst_seg]
  tags: [tal, topk, alignment]
  order: 7
  summary: 以 α·score^β·IoU 的对齐度选取 top-k 正样本，分类与回归目标一致性更强。
- id: loss.compose
  label: 总损失构成
  domain: loss
  type: concept
  difficulty: 2
  tasks: [detect, inst_seg]
  tags: [loss-weight, compose]
  order: 8
  summary: 总损失 = λ1·分类 + λ2·回归(IoU/DFL) + λ3·分割/深度等任务项，权重需按任务调平衡。
```

### `backend/data/nodes/07-task.yaml`

```yaml
# 任务专题
- id: task.detect
  label: 目标检测 Detect
  domain: task
  type: task
  difficulty: 1
  tasks: [detect]
  tags: [detect, box, baseline]
  order: 1
  summary: 输出框 + 类别 + 置信度，YOLO 的看家本领，也是其他任务的公共底座。
- id: task.inst_seg
  label: 实例分割 Segment
  domain: task
  type: task
  difficulty: 2
  tasks: [inst_seg]
  tags: [instance-seg, mask, proto]
  order: 2
  summary: 每个目标独立 mask（N,H,W）+ 框，适合计数、裁剪、逐目标测量（yolo26n-seg.pt）。
- id: task.sem_seg
  label: 语义分割 Semantic
  domain: task
  type: task
  difficulty: 2
  tasks: [sem_seg]
  tags: [semantic, dense, cityscapes, ade20k]
  order: 3
  summary: 逐像素类别图（H,W）不区分实例；YOLO26 新增 -sem 模型，Cityscapes mIoU 78.3→83.6。
- id: task.depth
  label: 深度估计 Depth
  domain: task
  type: task
  difficulty: 3
  tasks: [depth]
  tags: [monocular, depth-map, metric, log-depth]
  order: 4
  summary: 单目逐像素深度（米），YOLO26 新增 -depth，NYU δ1 0.882→0.933，log-head 无界量程。
- id: task.classify
  label: 图像分类 Classify
  domain: task
  type: task
  difficulty: 1
  tasks: [classify]
  tags: [classify, top-k]
  order: 5
  summary: 整图类别标签，常作为级联管线的第一道快速过滤。
- id: task.pose
  label: 姿态估计 Pose
  domain: task
  type: task
  difficulty: 2
  tasks: [pose]
  tags: [pose, keypoint, rle]
  order: 6
  summary: 人体/物体关键点；YOLO26 用 RLE 表示遮挡关键点，AP 提升显著。
- id: task.obb
  label: 旋转框检测 OBB
  domain: task
  type: task
  difficulty: 3
  tasks: [obb]
  tags: [obb, rotated, dota]
  order: 7
  summary: 带角度的旋转框，遥感/密集堆叠场景必备；YOLO26 专用角度损失提升 DOTA 精度。
- id: task.track
  label: 多目标跟踪 Track
  domain: task
  type: technique
  difficulty: 2
  tasks: [detect, inst_seg, pose, obb]
  tags: [tracking, bytetrack, botsort]
  order: 8
  summary: 在 predict 之上叠加 ByteTrack/BoT-SORT，给检测框稳定 ID，支撑计数与轨迹。
- id: task.seg_vs_sem
  label: 实例分割 vs 语义分割
  domain: task
  type: concept
  difficulty: 2
  tasks: [inst_seg, sem_seg]
  tags: [comparison, mask]
  order: 9
  summary: 实例分个数、语义分类别；输出形状 (N,H,W) vs (H,W)，选型看是否需要逐目标。
- id: task.depth_fusion
  label: 深度 + 分割融合（逐目标距离）
  domain: task
  type: technique
  difficulty: 3
  tasks: [inst_seg, depth]
  tags: [fusion, per-object-depth, median]
  order: 10
  summary: seg mask 内取深度中位数得到每个目标的距离，机器人抓取/避障的实用配方。
- id: task.openvocab
  label: 开放词汇检测分割
  domain: task
  type: task
  difficulty: 3
  tasks: [detect, inst_seg]
  tags: [open-vocabulary, yolo-world, yoloe]
  order: 11
  summary: 用文本/视觉提示识别任意类别，适合类别多变或零样本场景（YOLOE-26）。
- id: task.promptable
  label: 提示式分割 SAM
  domain: task
  type: task
  difficulty: 2
  tasks: [inst_seg]
  tags: [sam, prompt, auto-label]
  order: 12
  summary: 点/框/文本提示生成任意 mask，常与 YOLO 配合做半自动标注与精细化掩码。
```

### `backend/data/nodes/08-train.yaml`

```yaml
# 训练与调优
- id: train.labeling
  label: 数据收集与标注
  domain: train
  type: technique
  difficulty: 1
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [labelimg, roboflow, sam, auto-annotate]
  order: 1
  summary: 好数据决定上限；LabelImg/CVAT/Roboflow 标注，SAM 预标注可大幅提效。
- id: train.format
  label: 数据集格式
  domain: train
  type: concept
  difficulty: 2
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [yolo-txt, coco-json, png-mask, depth-png]
  order: 2
  summary: 检测用 YOLO txt；分割可用多边形 txt 或 PNG mask（255=忽略）；深度用 PNG/NPY 配对。
- id: train.augment
  label: 数据增强
  domain: train
  type: technique
  difficulty: 2
  tasks: [detect, inst_seg]
  tags: [mosaic, mixup, hsv, copy-paste, letterbox]
  order: 3
  summary: Mosaic/MixUp/HSV/copy-paste 提升泛化；深度任务禁用会破坏配对的拼接类增强。
- id: train.letterbox
  label: LetterBox 预处理
  domain: train
  type: concept
  difficulty: 2
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [letterbox, resize, normalize]
  order: 4
  summary: 保比例缩放 + 灰边填充到目标尺寸，部署时前后处理必须与训练保持一致。
- id: train.hyperparam
  label: 超参数配置
  domain: train
  type: technique
  difficulty: 2
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [lr, batch, epochs, imgsz, optimizer]
  order: 5
  summary: lr0/optimizer/batch/imgsz/epochs 五件套；深度微调建议 AdamW + lr0=1e-4。
- id: train.lr_schedule
  label: 学习率调度
  domain: train
  type: concept
  difficulty: 2
  tasks: [detect]
  tags: [warmup, cosine, scheduler]
  order: 6
  summary: warmup 防初期震荡，cosine/linear 衰减收尾；warmup_bias_lr 单独控制偏置项。
- id: train.transfer
  label: 迁移学习与微调
  domain: train
  type: technique
  difficulty: 2
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [fine-tune, pretrained, forgetting]
  order: 7
  summary: 从 COCO 预训练起步是默认路径；领域差异大时降低 lr，混 5-10% 通用图防灾难遗忘。
- id: train.amp
  label: 混合精度 AMP
  domain: train
  type: technique
  difficulty: 2
  tasks: [detect]
  tags: [amp, fp16, memory]
  order: 8
  summary: FP16 前向 + FP32 主权重，显存与速度双收，是默认开启的训练加速手段。
- id: train.monitor
  label: 训练监控与日志
  domain: train
  type: technique
  difficulty: 1
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [results.csv, tensorboard, wandb]
  order: 9
  summary: 看 loss 曲线、mAP/fitness 与混淆矩阵；best.pt 以 fitness 最优选取。
- id: train.overfit
  label: 过拟合诊断与处理
  domain: train
  type: technique
  difficulty: 2
  tasks: [detect]
  tags: [overfit, regularization, patience]
  order: 10
  summary: 训练 mAP 高验证低即过拟合：加数据、加增强、早停 patience、减小模型或权重衰减。
```

### `backend/data/nodes/09-eval.yaml`

```yaml
# 评估指标
- id: eval.pr
  label: Precision / Recall / F1
  domain: eval
  type: concept
  difficulty: 1
  tasks: [detect, inst_seg]
  tags: [precision, recall, f1]
  order: 1
  summary: 查准、查全及其调和平均；按置信度阈值取舍，工业场景常先定 recall 下限再提 precision。
- id: eval.map
  label: mAP@0.5 与 mAP@0.5:0.95
  domain: eval
  type: concept
  difficulty: 2
  tasks: [detect, inst_seg]
  tags: [map, coco, voc]
  order: 2
  summary: VOC 风格 AP50 宽松、COCO 风格 0.5:0.95 严格；跨论文对比必须注明协议。
- id: eval.curve
  label: PR 曲线与混淆矩阵
  domain: eval
  type: technique
  difficulty: 2
  tasks: [detect, inst_seg]
  tags: [pr-curve, confusion, error-analysis]
  order: 3
  summary: PR 曲线选阈值，混淆矩阵定位类别互混；Ultralytics val 自动导出这些诊断图。
- id: eval.seg_metrics
  label: 分割指标 mIoU / Pixel Acc
  domain: eval
  type: concept
  difficulty: 2
  tasks: [sem_seg, inst_seg]
  tags: [miou, pixel-accuracy, iou]
  order: 4
  summary: 语义分割看 mIoU 与像素准确率；实例分割 mask AP 仍沿用 COCO mask AP 口径。
- id: eval.depth_metrics
  label: 深度指标 δ1 / abs_rel / RMSE
  domain: eval
  type: concept
  difficulty: 3
  tasks: [depth]
  tags: [delta1, absrel, rmse, silog]
  order: 5
  summary: δ1 为误差 <1.25 的像素占比（越高越好）；abs_rel/RMSE/silog 越低越好，常做中位对齐。
- id: eval.speed
  label: 速度与复杂度指标
  domain: eval
  type: concept
  difficulty: 2
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [fps, latency, params, flops]
  order: 6
  summary: FPS/延迟（含前后处理）、参数量、FLOPs 共同刻画部署可行性，需在目标硬件上实测。
```

### `backend/data/nodes/10-deploy.yaml`

```yaml
# 部署与轻量化
- id: deploy.export
  label: 模型导出总览
  domain: deploy
  type: concept
  difficulty: 2
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [export, onnx, 23-formats]
  order: 1
  summary: model.export(format=...) 一键导出 23 种格式，覆盖 GPU/CPU/各类 NPU，是部署总入口。
- id: deploy.onnx
  label: ONNX 导出与简化
  domain: deploy
  type: technique
  difficulty: 2
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [onnx, onnxsim, opset, interop]
  order: 2
  summary: ONNX 是跨框架交换格式；用 onnxsim 融合算子、固定/动态 shape、检查自定义算子兼容性。
- id: deploy.tensorrt_intro
  label: TensorRT 入门与 Engine 构建
  domain: deploy
  type: technique
  difficulty: 3
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [tensorrt, engine, nvidia, build]
  order: 3
  summary: trtexec 或 Python API 从 ONNX 构建 engine，选 workspace/dynamic shape，NVIDIA 上延迟最低。
- id: deploy.tensorrt_quant
  label: TensorRT FP16 / INT8 量化
  domain: deploy
  type: technique
  difficulty: 3
  tasks: [detect]
  tags: [fp16, int8, calibration, quantize]
  order: 4
  summary: FP16 近乎无损加速；INT8 需校准集（data= + fraction），量化前后务必做精度回归。
- id: deploy.tensorrt_cpp
  label: TensorRT C++ 推理
  domain: deploy
  type: technique
  difficulty: 3
  tasks: [detect, inst_seg]
  tags: [cpp, cuda, api, runtime]
  order: 5
  summary: 加载 engine→绑定显存→enqueue 推理→拷回结果；配合 CUDA stream 与双缓冲可多路并发。
- id: deploy.tensorrt_plugin
  label: TensorRT Plugin 与后处理
  domain: deploy
  type: technique
  difficulty: 3
  tasks: [detect]
  tags: [plugin, efficientnms, postprocess]
  order: 6
  summary: 自定义算子写 plugin；EfficientNMS 插件可把 NMS 并入图；YOLO26 可走 NMS-free 省掉这一步。
- id: deploy.rknn_intro
  label: RKNN 入门（rknn-toolkit2）
  domain: deploy
  type: technique
  difficulty: 3
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [rknn, rockchip, rk3588, toolkit2]
  order: 7
  summary: ONNX→RKNN 转换（rknn-toolkit2），适配 Rockchip NPU（RK3588/RK3576），支持动态输入。
- id: deploy.rknn_quant
  label: RKNN 量化校准
  domain: deploy
  type: technique
  difficulty: 3
  tasks: [detect]
  tags: [rknn, ptq, int8, dataset]
  order: 8
  summary: PTQ 量化需 50-1000 张代表图做校准，量化后重点核对小目标与密集场景精度。
- id: deploy.rknn_cpp
  label: RKNN C API 板端部署
  domain: deploy
  type: technique
  difficulty: 3
  tasks: [detect, inst_seg]
  tags: [rknn, c-api, board, npu]
  order: 9
  summary: 板端用 librknnrt：init→inputs_set→run→outputs_get；注意 zero-copy、内存对齐与多线程。
- id: deploy.cpp_pipeline
  label: C++ 推理通用范式
  domain: deploy
  type: concept
  difficulty: 3
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [cpp, pre-process, post-process, pipeline]
  order: 10
  summary: 预处理（letterbox/归一化）→推理→后处理（decode/NMS/坐标还原）三段式，务必与训练对齐。
- id: deploy.onnxrt
  label: ONNX Runtime / OpenCV DNN / NCNN
  domain: deploy
  type: technique
  difficulty: 2
  tasks: [detect, inst_seg]
  tags: [onnxruntime, opencv-dnn, ncnn, cpu]
  order: 11
  summary: CPU/跨平台轻量方案：ORT 通用、OpenCV DNN 集成最方便、NCNN 适合 ARM 移动端。
- id: deploy.compression
  label: 轻量化：剪枝 / 蒸馏 / 量化 / NAS
  domain: deploy
  type: technique
  difficulty: 3
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [pruning, distillation, quantization, nas]
  order: 12
  summary: 四大压缩路线：剪枝减结构、蒸馏迁能力、量化降位宽、NAS 搜结构；可组合使用。
- id: deploy.engineering
  label: 多路视频流与工程优化
  domain: deploy
  type: technique
  difficulty: 3
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [video, multi-stream, threading, memory]
  order: 13
  summary: 解码/推理/显示流水线并行、batch 合并、零拷贝、显存池；工程量常大于模型本身。
- id: deploy.nmsfree_adv
  label: NMS-free 部署优势
  domain: deploy
  type: concept
  difficulty: 2
  tasks: [detect]
  tags: [nms-free, end-to-end, latency]
  order: 14
  summary: 免去 NMS 后处理：延迟更低、算子更少、量化/移植更省事，是边缘部署的重要趋势。
```

### `backend/data/nodes/11-practice.yaml`

```yaml
# 项目实战
- id: practice.flow
  label: 2D 视觉项目全流程
  domain: practice
  type: practice
  difficulty: 2
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [workflow, end-to-end]
  order: 1
  summary: 需求→数据→选型→训练→评估→部署→迭代，环环相扣，模型只是其中一环。
- id: practice.selection
  label: 需求分析与方案选型
  domain: practice
  type: practice
  difficulty: 2
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [requirement, model-selection, tradeoff]
  order: 2
  summary: 先定任务类型与指标下限，再在 n/s/m/l/x 与部署硬件间做速度-精度-成本取舍。
- id: practice.industrial
  label: 工业质检案例
  domain: practice
  type: practice
  difficulty: 2
  tasks: [detect, inst_seg]
  tags: [defect-detection, industrial, inspection]
  order: 3
  summary: 缺陷小且稀少：高分辨率 + 小目标增强 + 高召回策略，常配合 ROI 与规则后处理。
- id: practice.security
  label: 安防监控案例
  domain: practice
  type: practice
  difficulty: 2
  tasks: [detect, track, inst_seg]
  tags: [surveillance, tracking, multi-camera]
  order: 4
  summary: 多路视频 + 跟踪 + 告警规则：关注夜间/逆光鲁棒性、误报率与端侧并发能力。
- id: practice.robot
  label: 机器人视觉案例
  domain: practice
  type: practice
  difficulty: 3
  tasks: [detect, inst_seg, depth]
  tags: [robotics, grasping, avoidance, fusion]
  order: 5
  summary: 检测定位 + 深度测距 + 坐标标定，输出抓取位姿；延迟与抖动控制比平均精度更关键。
- id: practice.pitfalls
  label: 常见坑与调优清单
  domain: practice
  type: practice
  difficulty: 2
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [pitfall, checklist, debugging]
  order: 6
  summary: 标签泄漏、前后处理不一致、量化掉点、域差距、小目标漏检……清单化排查比拍脑袋调参有效。
- id: practice.checklist
  label: 端到端交付 Checklist
  domain: practice
  type: practice
  difficulty: 2
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [checklist, delivery, production]
  order: 7
  summary: 数据版本、指标基线、延迟预算、崩溃恢复、监控告警、回滚方案——量产前逐项打勾。
- id: practice.mastery
  label: 胸有成竹：知识图谱用法
  domain: practice
  type: practice
  difficulty: 1
  tasks: [detect, inst_seg, sem_seg, depth]
  tags: [learning, mastery, roadmap]
  order: 8
  summary: 按学习路径打地基→顺脉络→拆架构→进任务→上工程→落实战，遇到项目反查图谱组装方案。
```

### `backend/data/edges.yaml`

```yaml
# 图谱关系
# type: evolved | prereq | part_of | improves | uses | related

# ── 版本演进主轴 ─────────────────────────────────────
- { source: yolo.v1, target: yolo.v2, type: evolved, label: 演进为 }
- { source: yolo.v2, target: yolo.v3, type: evolved, label: 演进为 }
- { source: yolo.v3, target: yolo.v4, type: evolved, label: 演进为 }
- { source: yolo.v4, target: yolo.v5, type: evolved, label: 演进为 }
- { source: yolo.v5, target: yolo.v6, type: evolved, label: 并行演进 }
- { source: yolo.v5, target: yolo.v7, type: evolved, label: 并行演进 }
- { source: yolo.v5, target: yolo.v8, type: evolved, label: 演进为 }
- { source: yolo.v6, target: yolo.v8, type: related, label: 思路交汇 }
- { source: yolo.v7, target: yolo.v8, type: related, label: 思路交汇 }
- { source: yolo.v8, target: yolo.v9, type: evolved, label: 演进为 }
- { source: yolo.v8, target: yolo.v10, type: evolved, label: 演进为 }
- { source: yolo.v8, target: yolo11, type: evolved, label: 演进为 }
- { source: yolo.v9, target: yolo11, type: related, label: 结构借鉴 }
- { source: yolo.v10, target: yolo26, type: related, label: NMS-free 先行 }
- { source: yolo11, target: yolo12, type: evolved, label: 演进为 }
- { source: yolo11, target: yolo26, type: evolved, label: 演进为 }
- { source: yolo12, target: yolo26, type: related, label: 注意力探索 }
- { source: yolo26, target: yolo27, type: evolved, label: 下一代 }
- { source: yolo.v4, target: yolo.v4_legacy, type: related, label: 原生实现 }
- { source: yolo.v8, target: ecosystem.rtdetr, type: related, label: 同期竞品 }
- { source: yolo11, target: ecosystem.openvocab, type: related, label: 开放词汇分支 }
- { source: ecosystem.openvocab, target: yolo26, type: related, label: YOLOE-26 并入 }

# ── 基础 → 演进 ─────────────────────────────────────
- { source: foundation.detect_def, target: yolo.v1, type: prereq, label: 先修 }
- { source: foundation.conv, target: foundation.receptive, type: prereq, label: 先修 }
- { source: foundation.receptive, target: yolo.v1, type: prereq, label: 先修 }
- { source: foundation.iou, target: foundation.nms, type: prereq, label: 先修 }
- { source: foundation.iou, target: foundation.map, type: prereq, label: 先修 }
- { source: foundation.nms, target: yolo.v3, type: uses, label: 后处理依赖 }
- { source: foundation.anchor, target: yolo.v2, type: uses, label: 引入锚框 }
- { source: foundation.anchor, target: head.anchor_free, type: prereq, label: 对照先修 }
- { source: foundation.map, target: eval.map, type: prereq, label: 先修 }
- { source: foundation.dataset, target: train.format, type: prereq, label: 先修 }

# ── 骨干 ───────────────────────────────────────────
- { source: backbone.darknet, target: yolo.v3, type: part_of, label: v3 骨干 }
- { source: backbone.darknet, target: backbone.cspnet, type: improves, label: 演化为 }
- { source: backbone.cspnet, target: backbone.c3, type: improves, label: 实现为 }
- { source: backbone.c3, target: backbone.c2f, type: improves, label: 演化为 }
- { source: backbone.c2f, target: backbone.elan, type: related, label: 聚合思路相通 }
- { source: backbone.elan, target: backbone.area_attn, type: improves, label: 演化为 }
- { source: backbone.rep, target: yolo.v6, type: part_of, label: v6 骨干 }
- { source: backbone.spp, target: backbone.attention, type: related, label: 感受野增强 }
- { source: backbone.attention, target: yolo11, type: part_of, label: C2PSA }
- { source: backbone.area_attn, target: yolo12, type: part_of, label: v12 骨干 }
- { source: backbone.cspnet, target: yolo.v4, type: part_of, label: CSPDarknet }
- { source: backbone.c3, target: yolo.v5, type: part_of, label: v5 骨干 }
- { source: backbone.c2f, target: yolo.v8, type: part_of, label: v8 骨干 }
- { source: backbone.c2f, target: yolo26, type: part_of, label: v26 骨干 }
- { source: backbone.scale, target: yolo26, type: uses, label: n/s/m/l/x }

# ── 颈部 ───────────────────────────────────────────
- { source: neck.fpn, target: yolo.v3, type: part_of, label: FPN 头 }
- { source: neck.fpn, target: neck.pan, type: improves, label: 增强为 }
- { source: neck.pan, target: yolo.v4, type: part_of, label: PAN 颈部 }
- { source: neck.pan, target: neck.bifpn, type: improves, label: 加权演进 }
- { source: neck.pan, target: neck.reppan, type: improves, label: 重参数化 }
- { source: neck.reppan, target: yolo.v6, type: part_of, label: Rep-PAN }
- { source: neck.fusion, target: neck.fpn, type: uses, label: 融合策略 }
- { source: neck.attn, target: neck.pan, type: related, label: 嵌入注意力 }
- { source: neck.proto, target: task.inst_seg, type: part_of, label: 掩码原型 }
- { source: neck.proto, target: yolo26, type: part_of, label: 多尺度 proto }

# ── 检测头 ─────────────────────────────────────────
- { source: head.conv, target: yolo.v3, type: part_of, label: 耦合头 }
- { source: head.decoupled, target: head.conv, type: improves, label: 解耦改进 }
- { source: head.decoupled, target: yolo.v8, type: part_of, label: v8 解耦头 }
- { source: head.anchor_free, target: yolo.v8, type: part_of, label: anchor-free }
- { source: head.dfl, target: head.anchor_free, type: uses, label: 框回归 }
- { source: head.dfl, target: head.yolo26, type: related, label: v26 移除 }
- { source: head.tal, target: head.decoupled, type: uses, label: 标签分配 }
- { source: head.nmsfree, target: yolo.v10, type: part_of, label: v10 端到端 }
- { source: head.nmsfree, target: head.yolo26, type: improves, label: 演化为 }
- { source: head.yolo26, target: yolo26, type: part_of, label: v26 检测头 }
- { source: head.mask, target: task.inst_seg, type: part_of, label: 实例掩码头 }
- { source: head.mask, target: task.sem_seg, type: part_of, label: 语义掩码头 }
- { source: head.depth, target: task.depth, type: part_of, label: 深度头 }
- { source: head.depth, target: yolo26, type: part_of, label: v26 深度头 }

# ── 损失 ───────────────────────────────────────────
- { source: loss.cls, target: loss.compose, type: part_of, label: 分类项 }
- { source: loss.iou_family, target: loss.compose, type: part_of, label: 回归项 }
- { source: loss.dfl, target: loss.compose, type: part_of, label: 分布项 }
- { source: loss.iou_family, target: head.dfl, type: related, label: 协同回归 }
- { source: loss.tal, target: loss.assign_legacy, type: improves, label: 演化为 }
- { source: loss.assign_legacy, target: head.tal, type: related, label: 分配策略 }
- { source: loss.tal, target: head.tal, type: uses, label: 分配实现 }
- { source: loss.progloss, target: yolo26, type: part_of, label: ProgLoss }
- { source: loss.stal, target: yolo26, type: part_of, label: STAL }
- { source: loss.stal, target: loss.tal, type: improves, label: 小目标增强 }

# ── 任务 ───────────────────────────────────────────
- { source: task.detect, target: task.inst_seg, type: prereq, label: 先修 }
- { source: task.detect, target: task.pose, type: related, label: 同源头 }
- { source: task.detect, target: task.obb, type: related, label: 同源头 }
- { source: task.inst_seg, target: task.seg_vs_sem, type: related, label: 对比 }
- { source: task.sem_seg, target: task.seg_vs_sem, type: related, label: 对比 }
- { source: task.inst_seg, target: task.sem_seg, type: prereq, label: 先修 }
- { source: task.depth, target: task.depth_fusion, type: uses, label: 融合 }
- { source: task.inst_seg, target: task.depth_fusion, type: uses, label: 融合 }
- { source: task.detect, target: task.track, type: uses, label: 跟踪底座 }
- { source: ecosystem.sam, target: task.promptable, type: part_of, label: 提示分割 }
- { source: task.promptable, target: train.labeling, type: uses, label: 自动标注 }

# ── 训练 ───────────────────────────────────────────
- { source: train.labeling, target: train.format, type: prereq, label: 先修 }
- { source: train.format, target: train.augment, type: prereq, label: 先修 }
- { source: train.letterbox, target: train.augment, type: related, label: 预处理 }
- { source: train.augment, target: train.hyperparam, type: related, label: 训练配置 }
- { source: train.hyperparam, target: train.lr_schedule, type: uses, label: 调度 }
- { source: train.transfer, target: train.hyperparam, type: uses, label: 微调策略 }
- { source: train.amp, target: train.hyperparam, type: uses, label: 训练加速 }
- { source: train.monitor, target: train.overfit, type: uses, label: 诊断 }
- { source: train.transfer, target: yolo26, type: uses, label: 预训练微调 }

# ── 评估 ───────────────────────────────────────────
- { source: eval.pr, target: eval.map, type: prereq, label: 先修 }
- { source: eval.map, target: eval.curve, type: uses, label: 曲线分析 }
- { source: eval.map, target: task.detect, type: uses, label: 检测指标 }
- { source: eval.seg_metrics, target: task.sem_seg, type: uses, label: 分割指标 }
- { source: eval.seg_metrics, target: task.inst_seg, type: uses, label: mask AP }
- { source: eval.depth_metrics, target: task.depth, type: uses, label: 深度指标 }
- { source: eval.speed, target: deploy.export, type: related, label: 部署评估 }

# ── 部署 ───────────────────────────────────────────
- { source: deploy.export, target: deploy.onnx, type: part_of, label: ONNX 路线 }
- { source: deploy.onnx, target: deploy.tensorrt_intro, type: prereq, label: 先修 }
- { source: deploy.tensorrt_intro, target: deploy.tensorrt_quant, type: prereq, label: 先修 }
- { source: deploy.tensorrt_intro, target: deploy.tensorrt_cpp, type: prereq, label: 先修 }
- { source: deploy.tensorrt_cpp, target: deploy.tensorrt_plugin, type: related, label: 进阶 }
- { source: deploy.onnx, target: deploy.rknn_intro, type: prereq, label: 先修 }
- { source: deploy.rknn_intro, target: deploy.rknn_quant, type: prereq, label: 先修 }
- { source: deploy.rknn_intro, target: deploy.rknn_cpp, type: prereq, label: 先修 }
- { source: deploy.cpp_pipeline, target: deploy.tensorrt_cpp, type: uses, label: 通用范式 }
- { source: deploy.cpp_pipeline, target: deploy.rknn_cpp, type: uses, label: 通用范式 }
- { source: deploy.cpp_pipeline, target: deploy.onnxrt, type: related, label: CPU 方案 }
- { source: deploy.compression, target: backbone.scale, type: related, label: 轻量化选型 }
- { source: deploy.compression, target: deploy.tensorrt_quant, type: uses, label: 量化路线 }
- { source: deploy.nmsfree_adv, target: head.yolo26, type: uses, label: 端到端优势 }
- { source: deploy.nmsfree_adv, target: deploy.tensorrt_plugin, type: related, label: 免 NMS }
- { source: deploy.engineering, target: deploy.cpp_pipeline, type: uses, label: 工程优化 }
- { source: deploy.onnx, target: yolo26, type: uses, label: 导出格式 }

# ── 实战 ───────────────────────────────────────────
- { source: practice.flow, target: practice.selection, type: part_of, label: 选型环节 }
- { source: practice.selection, target: backbone.scale, type: uses, label: 尺度选型 }
- { source: practice.flow, target: practice.industrial, type: part_of, label: 质检案例 }
- { source: practice.flow, target: practice.security, type: part_of, label: 安防案例 }
- { source: practice.flow, target: practice.robot, type: part_of, label: 机器人案例 }
- { source: practice.industrial, target: task.detect, type: uses, label: 检测 }
- { source: practice.industrial, target: task.inst_seg, type: uses, label: 分割 }
- { source: practice.security, target: task.track, type: uses, label: 跟踪 }
- { source: practice.robot, target: task.depth_fusion, type: uses, label: 测距 }
- { source: practice.pitfalls, target: train.overfit, type: related, label: 常见问题 }
- { source: practice.pitfalls, target: deploy.compression, type: related, label: 量化掉点 }
- { source: practice.checklist, target: practice.flow, type: part_of, label: 交付清单 }
- { source: practice.mastery, target: practice.flow, type: prereq, label: 学习总纲 }

# ── 跨域先修（学习路径）────────────────────────────
- { source: foundation.conv, target: backbone.darknet, type: prereq, label: 先修 }
- { source: backbone.darknet, target: neck.fpn, type: prereq, label: 先修 }
- { source: neck.fpn, target: head.conv, type: prereq, label: 先修 }
- { source: head.conv, target: loss.iou_family, type: prereq, label: 先修 }
- { source: loss.compose, target: train.hyperparam, type: prereq, label: 先修 }
- { source: eval.map, target: train.monitor, type: prereq, label: 先修 }
- { source: train.transfer, target: deploy.export, type: prereq, label: 先修 }
- { source: deploy.export, target: practice.flow, type: prereq, label: 先修 }
```

---

## 4. 核心知识点正文（`backend/data/content/`）

> 其余节点正文由后端首次访问时自动生成学习骨架（是什么 / 为什么 / 怎么用 / 常见坑 / 延伸）。

### `content/foundation.conv.md`

````markdown
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

````

### `content/yolo26.md`

````markdown
# YOLO26

> 2026-01 Ultralytics 发布的实时端到端视觉模型系列，首个覆盖七任务的统一 YOLO。

## 这是什么

Ultralytics YOLO26（arXiv 2606.03748，Jocher 等）是 YOLO 系列当前旗舰：在同一套架构下同时支持
**目标检测、实例分割、语义分割、深度估计、图像分类、姿态估计、OBB** 七项任务，
并提供 n/s/m/l/x 五种尺度。它面向边缘与低功耗设备重新设计，CPU 推理速度较 YOLO11 最高提升 43%。

## 关键改进（相对 YOLO11）

| 改进 | 说明 |
|------|------|
| **可选 NMS-free 端到端** | 双头设计：一对多头训练、一对一头推理（`nms=False`，≤300 检测/图），延迟更低 |
| **移除 DFL** | 框回归不再依赖 Distribution Focal Loss，导出链路更简单、硬件兼容更广 |
| **MuSGD 优化器** | 融合 SGD 与 Muon 的混合优化器，借鉴 LLM 训练经验，训练更稳 |
| **ProgLoss + STAL** | 渐进损失把监督移向推理头；小目标感知标签分配改善密集微小目标 |
| **多尺度 Proto** | 实例分割掩码质量提升（对比 YOLO11 约 +2.5 box AP / +3.7 mask AP） |
| **log-depth 头** | 深度无界量程（约 0.02–150 m），`model.calibrate()` 可闭式标定绝对尺度 |

## 性能锚点（COCO detect，mAP50-95）

| 尺度 | mAP | 参数量级 | 适用 |
|------|-----|----------|------|
| n | 40.9 | 最小 | 边缘 / CPU |
| s | 48.6 | 小 | 速度精度平衡 |
| m | 53.1 | 中 | 多数应用首选 |
| l | 55.0 | 大 | 高精度 |
| x | 57.5 | 最大 | 精度优先 |

深度任务（NYU δ1，768px）：0.882 (n) → 0.933 (x)。
语义分割（Cityscapes mIoU，1024×2048）：78.3 (n) → 83.6 (x)。

## 怎么用

```python
from ultralytics import YOLO

# 七任务各自的权重命名
model = YOLO("yolo26n.pt")        # 检测
model = YOLO("yolo26n-seg.pt")    # 实例分割
model = YOLO("yolo26n-sem.pt")    # 语义分割
model = YOLO("yolo26n-depth.pt")  # 深度估计

results = model("bus.jpg")
```

NMS-free 推理：`model("bus.jpg", nms=False)`。

## 常见坑

- 迁移旧项目：接口与 YOLOv8/YOLO11 一致，**换权重即可**，但后处理若手写了 NMS，要决定保留还是走端到端。
- 量化部署前先确认 DFL 已移除带来的输出张量布局变化，重写 decode。
- 深度微调务必降学习率（AdamW, `lr0=1e-4`），否则覆盖预训练知识。
- 语义分割边界在低 `imgsz` 下易呈锯齿，优先用 1024+ 分辨率确认 `.pt` 效果再导出。

## 延伸与关联

- 对比选型：YOLO26 vs YOLO11 vs YOLOv8（Ultralytics 官方博客）
- 开放词汇版本：YOLOE-26（文本/视觉/无提示）
- 下一代：YOLO27 已进入候补名单，权重未发布
- 部署：见 `deploy.export` → TensorRT / RKNN / C++ 三条主线
````

### `content/yolo.v8.md`

````markdown
# YOLOv8

> Ultralytics 2023 年里程碑：anchor-free + C2f + 解耦头 + TAL/DFL，统一多任务 API。

## 这是什么

YOLOv8 是第一个全面 anchor-free 的 Ultralytics YOLO，也是把检测 / 实例分割 /
分类 / 姿态 / OBB 统一到同一套 `YOLO()` API 的起点。它奠定了此后 v9-v26 的工程接口习惯。

## 相对 YOLOv5 的核心变化

| 模块 | YOLOv5 | YOLOv8 |
|------|--------|--------|
| 骨干块 | C3 | C2f（更多梯度分支） |
| 检测头 | 耦合 anchor 头 | 解耦 anchor-free 头 |
| 标签分配 | autoanchor + IoU | TAL 任务对齐分配 |
| 框回归 | CIoU | CIoU + DFL |
| API | `detect.py` | 统一 `YOLO()` 类 |

## 性能（COCO detect, mAP50-95）

| 尺度 | mAP |
|------|-----|
| n | 37.3 |
| s | 44.9 |
| m | 50.2 |
| l | 52.9 |
| x | 53.9 |

## 训练示例

```python
from ultralytics import YOLO
model = YOLO("yolo8n.pt")
model.train(data="coco8.yaml", epochs=100, imgsz=640)
```

## 为什么今天还要学 v8

- 大量存量项目、第三方集成（ROS、DeepStream、labeling 工具）仍基于 v8
- v8 → v11 → v26 的 API 高度兼容，理解 v8 等于掌握三代接口
- 后续版本的改进（C3k2、NMS-free、去 DFL）都是相对 v8 基线的增量

## 常见坑

- 从 v5 迁移时手写的 anchor 后处理代码全部作废
- DFL 输出维度较大，导出后处理要按 v8 布局解析
- 只用 `.pt` 训练调参，忽略导出后量化掉点

## 延伸与关联

- 前身：`yolo.v5`；后继：`yolo11` → `yolo26`
- 机制：`head.decoupled`、`head.tal`、`head.dfl`
- 训练配方：`train.hyperparam`
````

### `content/task.detect.md`

````markdown
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
````

### `content/task.inst_seg.md`

````markdown
# 实例分割 Segment

> 为每个目标生成独立掩码（N, H, W）并给出框，可数、可裁剪、可逐目标测量。

## 这是什么

实例分割 = 检测 + 逐实例像素级分割。同一类别的不同目标会得到**各自独立**的 mask。
YOLO 的实现是「原型掩码 + 系数」：网络输出一组原型 mask（proto）和每个目标的系数，
线性组合后 sigmoid 得到实例 mask，非常轻量。

## 输出结构

- `result.masks.data` → (N, H, W) 二值 mask
- `result.masks.xy` → 多边形轮廓
- `result.boxes` → 框 + 置信度

## 权重与训练

```python
model = YOLO("yolo26n-seg.pt")
results = model.train(data="your_seg.yaml", epochs=100, imgsz=640)
```

- 数据格式：YOLO 多边形 txt（`cls x1 y1 x2 y2 ...`）或 COCO json
- YOLO26 升级多尺度 proto，mask 质量显著优于 YOLO11
- 需要精细边缘时用 `retina_masks=True`（原始分辨率 mask，较慢）

## 与语义分割的分界

| | 实例分割 | 语义分割 |
|---|---|---|
| 区分同类实例 | ✅ | ❌ 合并 |
| 输出 | (N,H,W) + 框 | (H,W) 类别图 |
| 典型用途 | 计数/跟踪/裁剪/测尺寸 | 场景解析/可行驶区域 |

## 常见坑

- 掩码边缘溢出到相邻目标：可做腐蚀后处理，或提高分辨率再训
- 小目标 mask 粗糙：提高 `imgsz`，或 `retina_masks=True`
- 把语义需求当实例做 → 输出冗余；反之计数需求用语义分割会失败

## 延伸与关联

- 先修：`task.detect`、`neck.proto`
- 对比：`task.seg_vs_sem`、`task.sem_seg`
- 部署：mask 输出张量较大，TensorRT/RKNN 需核对 proto 维度
````

### `content/task.sem_seg.md`

````markdown
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
````

### `content/task.depth.md`

````markdown
# 深度估计 Depth

> 单目图像 → 逐像素深度图（米），为 2D 检测补上第三维距离信息。

## 这是什么

单目深度估计预测每个像素到相机的距离，输出 (H, W) 浮点图（单位：米）。
YOLO26 新增 `-depth` 任务，使 YOLO 管线内可以直接做实时测距。

## log-depth 头的设计

- 输出 `exp(logit)`，**无界**（约 0.02–150 m）
- **解耦场景形状与绝对尺度**：网络预测相对 log 深度，绝对米数由
  `exp(a·log d + b)` 两参数变换给出
- 对比：`sigmoid × max_depth` 有界头会把量程写死，超出即截断（KITTI 80m 场景会崩）

官方 A/B：同数据同日程，log 头混合量程 δ1 0.367，有界头仅 0.221 且 epoch 1 就停滞。

## 模型（NYU Eigen δ1 @768）

| 权重 | δ1 | abs_rel | T4 TensorRT |
|------|-----|---------|-------------|
| yolo26n-depth | 0.882 | 0.109 | 2.7 ms |
| yolo26s-depth | 0.896 | 0.104 | 3.8 ms |
| yolo26m-depth | 0.921 | 0.089 | 6.0 ms |
| yolo26l-depth | 0.930 | 0.083 | 7.7 ms |
| yolo26x-depth | 0.933 | 0.080 | 13.6 ms |

同硬件下比 Depth Anything V2 Small 快 1.5×（x）到 7.7×（n）。

## 训练与标定

数据：RGB 图 + 16bit PNG（毫米）或 NPY（米）深度图配对；`images/` ↔ `depth/` 目录对应。

```python
model = YOLO("yolo26s-depth.pt")
model.train(data="my.yaml", epochs=20, imgsz=640,
            optimizer="AdamW", lr0=1e-4, warmup_bias_lr=1e-4)

# 尺度标定（无需梯度训练，秒级）
model.calibrate(data="calib.yaml")
model.save("yolo26s-depth-calibrated.pt")
```

- **微调必降 lr**（约默认的 1/100），否则冲掉预训练
- mosaic/mixup/copy_paste 对深度自动禁用（会破坏配对）
- 无深度相机也能标定：每图测几个点（激光测距/卷尺）即可

## 逐目标距离（实用配方）

```python
seg = YOLO("yolo26n-seg.pt")(img, retina_masks=True)[0]
depth = YOLO("yolo26n-depth.pt")(img)[0].depth.data
for mask, cls in zip(seg.masks.data.bool(), seg.boxes.cls):
    v = depth[mask & (depth > 0)]
    if v.numel():
        print(seg.names[int(cls)], v.median().item(), "m")
```

## 常见坑

- 把相对深度当绝对米数用：先 `calibrate()` 或确认 checkpoint 自带标定
- 激光测距是斜距，深度图是沿光轴距离，偏离图像中心约 3.5%/15° 需换算
- 忽略 0 值像素（无效标注）再算中位数

## 延伸与关联

- 指标：`eval.depth_metrics`（δ1/abs_rel/RMSE/silog）
- 融合：`task.depth_fusion`
- 相关非 YOLO 方案：Depth Anything V2、Metric3D、UniDepth（可做伪标签）
````

### `content/deploy.tensorrt_intro.md`

````markdown
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
````

### `content/deploy.rknn_intro.md`

````markdown
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
````

### `content/deploy.cpp_pipeline.md`

````markdown
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
````

### `content/head.tal.md`

````markdown
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
````

### `content/practice.flow.md`

````markdown
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
````

---

## 5. 前端（React + Vite + AntV G6）

> V2 评审整改：学习页目录/阅读双状态（LearningReader）、详情请求竞态修复、KaTeX 公式渲染（MarkdownBody）、骨架占位友好化、图谱精简检查器、移除力导向、时间线只含真实年份里程碑。

### `frontend/package.json`

```json
{
  "name": "yolo-kg-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@ant-design/icons": "^5.5.1",
    "@antv/g6": "^5.0.0",
    "antd": "^5.22.0",
    "katex": "^0.19.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-markdown": "^9.0.1",
    "rehype-katex": "^7.0.1",
    "remark-gfm": "^4.0.0",
    "remark-math": "^6.0.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "typescript": "^5.6.3",
    "vite": "^5.4.10"
  }
}

```

### `frontend/vite.config.ts`

```ts
import react from "@vitejs/plugin-react";

export default {
  plugins: [react()],
  server: {
    port: 5173,
    host: "127.0.0.1",
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
};

```

### `frontend/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}

```

### `frontend/index.html`

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>YOLO 知识图谱</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>

```

### `frontend/src/types.ts`

```ts
export interface Domain {
  id: string;
  label: string;
  color: string;
  description: string;
}

export interface GraphNode {
  id: string;
  label: string;
  domain: string;
  type: string;
  year?: number;
  tasks: string[];
  tags: string[];
  difficulty: number;
  summary: string;
  order: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  label: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  domains: Domain[];
}

export interface RelatedItem {
  id: string;
  label: string;
  type: string;
  label_zh: string;
}

export interface NodeDetail extends GraphNode {
  content: string;
  content_file: string;
  related: {
    prereq: RelatedItem[];
    next: RelatedItem[];
    related: RelatedItem[];
  };
}

export type ProgressMap = Record<string, "unlearned" | "learning" | "learned">;

export interface Stats {
  total: number;
  learned: number;
  learning: number;
  percent: number;
  domains: Record<
    string,
    { label: string; total: number; learned: number; learning: number; unlearned: number }
  >;
}

```

### `frontend/src/api.ts`

```ts
import type { GraphData, NodeDetail, ProgressMap, Stats } from "./types";

const BASE = "/api";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(BASE + url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

export const api = {
  graph: () => get<GraphData>("/graph"),
  node: (id: string) => get<NodeDetail>(`/node/${encodeURIComponent(id)}`),
  search: (q: string) =>
    get<{ results: { id: string; label: string; domain: string; summary: string }[] }>(
      `/search?q=${encodeURIComponent(q)}`
    ),
  progress: () => get<ProgressMap>("/progress"),
  setProgress: async (id: string, status: string) => {
    const res = await fetch(`${BASE}/progress/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error("progress update failed");
    return res.json();
  },
  stats: () => get<Stats>("/stats"),
};

```

### `frontend/src/store.ts`

```ts
import { create } from "zustand";
import { api } from "./api";
import type { GraphData, NodeDetail, ProgressMap, Stats } from "./types";

interface CanvasApi {
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  focusSelected: () => void;
}

interface Store {
  graph: GraphData | null;
  detail: NodeDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  progress: ProgressMap;
  stats: Stats | null;
  selectedId: string | null;
  readerId: string | null;
  viewMode: "graph" | "learn";
  layoutMode: "cluster" | "timeline";
  domainFilter: string | null;
  taskFilter: string | null;
  query: string;
  loading: boolean;
  showWeakEdges: boolean;
  focusMode: boolean;
  sidebarWidth: number;
  detailWidth: number;
  showMinimap: boolean;
  shortcutsOpen: boolean;
  canvasApi: CanvasApi | null;

  load: () => Promise<void>;
  select: (id: string | null) => Promise<void>;
  openReader: (id: string) => void;
  closeReader: () => void;
  setProgress: (id: string, status: "unlearned" | "learning" | "learned") => Promise<void>;
  setLayout: (m: "cluster" | "timeline") => void;
  setViewMode: (m: "graph" | "learn") => void;
  setDomainFilter: (d: string | null) => void;
  setTaskFilter: (t: string | null) => void;
  setQuery: (q: string) => void;
  setShowWeakEdges: (v: boolean) => void;
  setFocusMode: (v: boolean) => void;
  setSidebarWidth: (w: number) => void;
  setDetailWidth: (w: number) => void;
  setShowMinimap: (v: boolean) => void;
  setShortcutsOpen: (v: boolean) => void;
  setCanvasApi: (api: CanvasApi | null) => void;
}

/** 防止快速点击时旧响应覆盖新选择 */
let detailRequestSeq = 0;

const loadWidth = (key: string, fallback: number) => {
  try {
    const v = Number(localStorage.getItem(key));
    return v >= 180 && v <= 640 ? v : fallback;
  } catch {
    return fallback;
  }
};

export const useStore = create<Store>((set, get) => ({
  graph: null,
  detail: null,
  detailLoading: false,
  detailError: null,
  progress: {},
  stats: null,
  selectedId: null,
  readerId: null,
  viewMode: "graph",
  layoutMode: "cluster",
  domainFilter: null,
  taskFilter: null,
  query: "",
  loading: true,
  showWeakEdges: false,
  focusMode: true,
  sidebarWidth: loadWidth("kg-sidebar-w", 250),
  detailWidth: loadWidth("kg-detail-w", 390),
  showMinimap: true,
  shortcutsOpen: false,
  canvasApi: null,

  load: async () => {
    set({ loading: true });
    const [graph, progress, stats] = await Promise.all([
      api.graph(),
      api.progress(),
      api.stats(),
    ]);
    set({ graph, progress, stats, loading: false });
  },

  select: async (id) => {
    if (!id) {
      detailRequestSeq++;
      set({ selectedId: null, detail: null, detailLoading: false, detailError: null });
      return;
    }
    const requestSeq = ++detailRequestSeq;
    // 立刻清空旧详情并显示加载态，避免“看起来没进去”
    set({ selectedId: id, detail: null, detailLoading: true, detailError: null });
    try {
      const detail = await api.node(id);
      if (requestSeq !== detailRequestSeq) return; // 过期响应，丢弃
      set({ detail, detailLoading: false, detailError: null });
    } catch {
      if (requestSeq !== detailRequestSeq) return;
      set({ detailLoading: false, detailError: "详情加载失败，请重试" });
    }
  },

  openReader: (id) => {
    set({ readerId: id, viewMode: "learn" });
    get().select(id);
  },
  closeReader: () => set({ readerId: null }),

  setProgress: async (id, status) => {
    await api.setProgress(id, status);
    const progress = await api.progress();
    const stats = await api.stats();
    set({ progress, stats });
  },

  setLayout: (m) => set({ layoutMode: m }),
  setViewMode: (m) => set({ viewMode: m }),
  setDomainFilter: (d) => set({ domainFilter: d }),
  setTaskFilter: (t) => set({ taskFilter: t }),
  setQuery: (q) => set({ query: q }),
  setShowWeakEdges: (v) => set({ showWeakEdges: v }),
  setFocusMode: (v) => set({ focusMode: v }),
  setSidebarWidth: (w) => {
    const v = Math.max(180, Math.min(420, Math.round(w)));
    try { localStorage.setItem("kg-sidebar-w", String(v)); } catch { /* ignore */ }
    set({ sidebarWidth: v });
  },
  setDetailWidth: (w) => {
    const v = Math.max(280, Math.min(620, Math.round(w)));
    try { localStorage.setItem("kg-detail-w", String(v)); } catch { /* ignore */ }
    set({ detailWidth: v });
  },
  setShowMinimap: (v) => set({ showMinimap: v }),
  setShortcutsOpen: (v) => set({ shortcutsOpen: v }),
  setCanvasApi: (api) => set({ canvasApi: api }),
}));

```

### `frontend/src/main.tsx`

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#3b82f6",
          borderRadius: 8,
          colorBgContainer: "#1a2029",
          colorBgElevated: "#212832",
          colorBorder: "#2a323d",
          colorText: "#e6edf3",
          colorTextSecondary: "#8b98a5",
          fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>
);

```

### `frontend/src/styles.css`

```css
:root {
  --bg: #0f1419;
  --panel: #1a2029;
  --panel-2: #212832;
  --ink: #e6edf3;
  --ink-2: #8b98a5;
  --ink-3: #6b7280;
  --accent: #3b82f6;
  --accent-2: #2563eb;
  --border: #2a323d;
  --ok: #22c55e;
  --warn: #f59e0b;
  --radius: 10px;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body {
  background: var(--bg);
  color: var(--ink);
  font-size: 14px;
  line-height: 1.75;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* ── TopBar ───────────────────────────── */
.topbar {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.topbar .brand { font-size: 16px; font-weight: 600; white-space: nowrap; }
.topbar .brand span { color: var(--accent); }
.topbar .spacer { flex: 1; }
.topbar .progress-pill {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--ink-2);
  white-space: nowrap;
}
.topbar .progress-pill b { color: var(--ok); }

/* ── Layout ───────────────────────────── */
.main { display: flex; flex: 1; min-height: 0; }

.side-wrap {
  flex-shrink: 0;
  min-width: 0;
  display: flex;
  transition: width .12s ease-out;
}
.detail-wrap {
  flex-shrink: 0;
  min-width: 0;
  display: flex;
  transition: width .12s ease-out;
}

/* 面板拖拽分隔条 */
.resizer {
  width: 5px;
  flex-shrink: 0;
  cursor: col-resize;
  background: transparent;
  position: relative;
  z-index: 6;
  transition: background .15s;
}
.resizer:hover, .resizer:active {
  background: rgba(59, 130, 246, 0.45);
}

.sidebar {
  width: 100%;
  flex-shrink: 0;
  background: var(--panel);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 12px;
}
.sidebar h3 {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-3);
  margin: 14px 0 8px;
  font-weight: 600;
}
.task-chips { display: flex; flex-wrap: wrap; gap: 6px; }

.domain-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--ink);
  border: 1px solid transparent;
  font-size: 13px;
}
.domain-item:hover { background: var(--panel-2); }
.domain-item.active {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.4);
}
.domain-item .caret {
  width: 12px;
  color: var(--ink-3);
  font-size: 10px;
  cursor: pointer;
  flex-shrink: 0;
}
.dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.domain-item .count {
  margin-left: auto;
  font-size: 11px;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}

.domain-group { margin-bottom: 2px; }
.domain-bar {
  height: 3px;
  background: var(--panel-2);
  border-radius: 2px;
  margin: 1px 10px 3px;
  overflow: hidden;
}
.domain-bar-fill { height: 100%; border-radius: 2px; transition: width .3s; }
.domain-children { padding-left: 14px; }

.path-list { display: flex; flex-direction: column; gap: 1px; }
.path-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--ink-2);
  border-left: 2px solid transparent;
}
.path-item:hover { background: var(--panel-2); color: var(--ink); }
.path-item.active {
  color: var(--ink);
  border-left-color: var(--accent);
  background: var(--panel-2);
}

/* 节点学习状态点（形状 + 颜色，不只靠透明度） */
.st {
  width: 8px; height: 8px; border-radius: 50%;
  flex-shrink: 0;
  border: 1.5px solid #4b5563;
  background: transparent;
}
.st-learned { background: var(--ok); border-color: var(--ok); }
.st-learning {
  background: var(--warn); border-color: var(--warn);
  border-radius: 2px;
}
.st-unlearned { background: transparent; border-color: #4b5563; }

.path-focus {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  margin-bottom: 6px;
}
.path-focus:hover { border-color: var(--accent); }
.path-focus.next { border-color: rgba(59,130,246,.35); }
.path-focus.active {
  border-color: var(--accent);
  background: rgba(59, 130, 246, 0.14);
}
.path-focus-tag {
  font-size: 10px;
  color: var(--accent);
  letter-spacing: .05em;
}
.path-focus-label { font-size: 13px; color: var(--ink); font-weight: 500; }
.path-focus-sub {
  font-size: 11px;
  color: var(--ink-3);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sidebar-hint {
  margin: 16px 6px 8px;
  font-size: 11px;
  line-height: 1.8;
  color: var(--ink-3);
}
.sidebar-hint kbd {
  min-width: 0;
  padding: 0 5px;
  font-size: 10px;
}

.path-more {
  margin-top: 10px;
  font-size: 12px;
  color: var(--ink-3);
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 6px;
}
.path-more:hover { background: var(--panel-2); color: var(--ink); }

/* ── Canvas ───────────────────────────── */
.canvas-wrap {
  flex: 1;
  min-width: 0;
  position: relative;
  background:
    radial-gradient(ellipse at 30% 20%, rgba(59, 130, 246, 0.05), transparent 50%),
    radial-gradient(ellipse at 80% 80%, rgba(168, 85, 247, 0.04), transparent 45%),
    var(--bg);
}
#graph-container { width: 100%; height: 100%; }

/* ── 学习页面 ─────────────────────────── */
.learn-page {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 28px 36px 48px;
  scroll-behavior: smooth;
}
.learn-hero {
  max-width: 980px;
  margin: 0 auto 28px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border);
}
.learn-hero h1 {
  margin: 0 0 8px;
  font-size: 26px;
  letter-spacing: 0.01em;
}
.learn-hero p {
  margin: 0 0 16px;
  color: var(--ink-2);
  font-size: 13.5px;
  line-height: 1.9;
}
.learn-hero-progress { max-width: 520px; }
.learn-hero-sub {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--ink-3);
}

.learn-section {
  max-width: 980px;
  margin: 0 auto 34px;
  scroll-margin-top: 12px;
}
.learn-section-head {
  margin-bottom: 14px;
}
.learn-section-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.learn-section-title h2 {
  margin: 0;
  font-size: 18px;
}
.learn-dot {
  width: 12px; height: 12px; border-radius: 4px;
  flex-shrink: 0;
}
.learn-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}
.learn-section-head p {
  margin: 6px 0 10px;
  color: var(--ink-2);
  font-size: 12.5px;
}
.learn-bar {
  height: 4px;
  background: var(--panel-2);
  border-radius: 3px;
  overflow: hidden;
}
.learn-bar-fill { height: 100%; border-radius: 3px; transition: width .35s; }

.learn-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.learn-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 15px 12px;
  cursor: pointer;
  transition: border-color .15s, transform .15s, box-shadow .15s;
}
.learn-card:hover {
  border-color: rgba(59, 130, 246, 0.55);
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
}
.learn-card.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.4);
}
.learn-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.learn-card-top h3 {
  margin: 0;
  font-size: 14.5px;
  line-height: 1.4;
}
.learn-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 8px;
}
.learn-card p {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.75;
  color: var(--ink-2);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.learn-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.learn-foot {
  max-width: 980px;
  margin: 12px auto 0;
  padding-top: 18px;
  border-top: 1px solid var(--border);
  color: var(--ink-3);
  font-size: 12px;
  text-align: center;
}

.canvas-controls {
  position: absolute;
  left: 14px;
  bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 5;
}
.canvas-controls button {
  width: 32px; height: 32px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: rgba(26, 32, 41, 0.92);
  color: var(--ink-2);
  font-size: 14px;
  cursor: pointer;
  line-height: 1;
}
.canvas-controls button:hover:not(:disabled) {
  color: var(--ink);
  border-color: var(--accent);
}
.canvas-controls button:disabled { opacity: .4; cursor: default; }

.canvas-legend {
  position: absolute;
  right: 14px;
  bottom: 14px;
  background: rgba(26, 32, 41, 0.92);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 11px;
  color: var(--ink-2);
  z-index: 5;
  min-width: 96px;
}
.legend-title {
  font-size: 10px;
  color: var(--ink-3);
  letter-spacing: .06em;
  margin-bottom: 5px;
}
.legend-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 3px 0;
}
.legend-line {
  width: 18px;
  border-radius: 2px;
  flex-shrink: 0;
}
.legend-dot {
  width: 10px; height: 10px; border-radius: 50%;
  border: 2px solid;
  background: transparent;
  flex-shrink: 0;
}

/* ── Detail panel ─────────────────────── */
.detail {
  width: 100%;
  flex-shrink: 0;
  background: var(--panel);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.detail-head {
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border);
}
.detail-head h2 { margin: 0 0 8px; font-size: 18px; line-height: 1.4; }
.detail-head .meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--ink-2);
}
.chip.blue { color: #93c5fd; border-color: rgba(59,130,246,.4); }
.chip.green { color: #86efac; border-color: rgba(34,197,94,.4); }
.chip.purple { color: #d8b4fe; border-color: rgba(168,85,247,.4); }
.chip.amber { color: #fcd34d; border-color: rgba(245,158,11,.4); }

.detail-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

.section-label {
  font-size: 10px;
  letter-spacing: .08em;
  color: var(--ink-3);
  text-transform: uppercase;
  margin-bottom: 6px;
  font-weight: 600;
}

.detail-summary {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.detail-summary p {
  margin: 0;
  color: var(--ink);
  font-size: 13px;
  line-height: 1.8;
}

.detail-related {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.related-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 4px 0 10px;
}
.related-row:last-child { margin-bottom: 0; }
.related-item {
  cursor: pointer;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--ink-2);
}
.related-item:hover { border-color: var(--accent); color: var(--ink); }

.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px 24px;
}
.detail-open {
  padding: 4px 16px 12px;
}
.stub-hint {
  font-size: 11px;
  color: var(--warn);
  background: rgba(245, 158, 11, 0.1);
  border: 1px dashed rgba(245, 158, 11, 0.35);
  border-radius: 6px;
  padding: 6px 10px;
  margin-bottom: 12px;
}

/* 内容建设中（替代裸占位文本） */
.stub-state {
  background: var(--panel-2);
  border: 1px dashed var(--border);
  border-radius: 12px;
  padding: 20px 22px;
}
.stub-badge {
  display: inline-block;
  font-size: 11px;
  color: var(--warn);
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 999px;
  padding: 2px 10px;
  margin-bottom: 10px;
}
.stub-state p { color: var(--ink-2); font-size: 13px; }
.stub-list { list-style: none; padding: 0; margin: 12px 0; }
.stub-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 4px;
  color: var(--ink-2);
  font-size: 13px;
}
.stub-check {
  width: 14px; height: 14px;
  border: 1.5px solid var(--ink-3);
  border-radius: 4px;
  flex-shrink: 0;
}
.stub-hint code {
  background: var(--panel);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  color: #fca5a5;
}

/* 正文排版：技术文档感 */
.detail-body p, .reader-body p {
  font-size: 14px;
  line-height: 1.85;
}
.detail-body h1, .reader-body h1 {
  font-size: 19px;
  margin: 0 0 14px;
  line-height: 1.5;
  letter-spacing: 0.01em;
}
.detail-body h2, .reader-body h2 {
  font-size: 15.5px;
  margin: 26px 0 10px;
  padding-bottom: 7px;
  border-bottom: 1px solid var(--border);
  color: var(--ink);
}
.detail-body h3, .reader-body h3 {
  font-size: 14px;
  margin: 18px 0 8px;
}
.detail-body li, .reader-body li {
  margin: 5px 0;
  line-height: 1.8;
  font-size: 14px;
}
.detail-body code, .reader-body code {
  background: var(--panel-2);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12.5px;
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  color: #fca5a5;
}
.detail-body pre, .reader-body pre {
  background: #0d1117;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  overflow-x: auto;
  margin: 12px 0;
}
.detail-body pre code, .reader-body pre code {
  background: transparent;
  padding: 0;
  color: #e6edf3;
  font-size: 12.5px;
  line-height: 1.7;
}
.detail-body table, .reader-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 13px;
}
.detail-body th, .detail-body td,
.reader-body th, .reader-body td {
  border: 1px solid var(--border);
  padding: 8px 10px;
  text-align: left;
  line-height: 1.7;
}
.detail-body th, .reader-body th {
  background: var(--panel-2);
  color: var(--ink-2);
  font-weight: 500;
}

/* KaTeX 公式 */
.katex-display { margin: 14px 0 !important; overflow-x: auto; overflow-y: hidden; }
.katex { font-size: 1.08em; }

.detail-body blockquote, .reader-body blockquote {
  margin: 12px 0;
  padding: 9px 14px;
  border-left: 3px solid var(--accent);
  background: rgba(59, 130, 246, 0.08);
  border-radius: 0 8px 8px 0;
  color: var(--ink-2);
}
.detail-body a, .reader-body a { color: var(--accent); text-decoration: none; }
.detail-body a:hover, .reader-body a:hover { text-decoration: underline; }

/* ── 学习阅读器 ─────────────────────────── */
.reader {
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
}
.reader-bar {
  position: sticky;
  top: 0;
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 0;
  background: rgba(15, 20, 25, 0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border);
}
.reader-crumb {
  flex: 1;
  font-size: 12.5px;
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.reader-crumb span { cursor: pointer; }
.reader-crumb span:hover { color: var(--ink); }
.reader-crumb .sep { margin: 0 6px; cursor: default; }
.reader-crumb .cur { color: var(--ink); font-weight: 500; cursor: default; }
.reader-nav { display: flex; gap: 8px; }

.reader-body {
  padding: 26px 8px 60px;
}
.reader-head { margin-bottom: 24px; }
.reader-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.reader-head h1 {
  font-size: 28px;
  margin: 0 0 12px;
  line-height: 1.4;
}
.reader-summary {
  margin: 0 0 16px;
  padding: 12px 16px;
  background: rgba(59, 130, 246, 0.08);
  border-left: 3px solid var(--accent);
  border-radius: 0 10px 10px 0;
  color: var(--ink-2);
  font-size: 14px;
  line-height: 1.85;
}
.reader-actions {
  display: flex;
  gap: 8px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border);
}

.reader-related {
  margin-top: 36px;
  padding-top: 18px;
  border-top: 1px solid var(--border);
}
.related-tag {
  font-size: 11px;
  color: var(--ink-3);
  min-width: 34px;
}
.reader-foot-nav {
  display: flex;
  justify-content: space-between;
  margin-top: 36px;
  padding-top: 18px;
  border-top: 1px solid var(--border);
}

/* 学习卡片 CTA */
.learn-card-cta {
  margin-top: 10px;
  font-size: 12px;
  color: var(--accent);
  opacity: 0;
  transition: opacity .15s;
}
.learn-card:hover .learn-card-cta { opacity: 1; }

/* ── Search modal ─────────────────────── */
.search-hit { padding: 10px 12px; border-radius: 8px; cursor: pointer; }
.search-hit:hover { background: var(--panel-2); }
.search-hit .t { font-weight: 500; }
.search-hit .s { font-size: 12px; color: var(--ink-2); margin-top: 2px; }

/* ── 快捷键弹窗 ───────────────────────── */
.shortcut-list { display: flex; flex-direction: column; gap: 2px; }
.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 4px;
  border-radius: 6px;
  font-size: 13px;
}
.shortcut-row:hover { background: var(--panel-2); }
.shortcut-row span { color: var(--ink-2); }
kbd {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 5px;
  padding: 2px 8px;
  font-size: 11px;
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  color: var(--ink);
  min-width: 96px;
  text-align: center;
}

.empty {
  color: var(--ink-2);
  text-align: center;
  padding: 48px 20px;
}
.empty h3 { color: var(--ink); margin-bottom: 8px; }

/* antd dark tweaks */
.ant-btn { border-radius: 8px; }
.ant-segmented { background: var(--panel-2); }
.ant-input-affix-wrapper { background: var(--panel-2); border-color: var(--border); }
.ant-input { background: transparent; color: var(--ink); }
.ant-modal-content { background: var(--panel); }
.ant-progress-text { color: var(--ink-2) !important; }

/* 滚动条 */
.sidebar::-webkit-scrollbar, .detail-body::-webkit-scrollbar { width: 8px; }
.sidebar::-webkit-scrollbar-thumb, .detail-body::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}

```

### `frontend/src/App.tsx`

```tsx
import { useEffect, useState, useCallback, useRef } from "react";
import { Spin, Empty, Segmented, Input, Button, Modal, Tooltip } from "antd";
import {
  SearchOutlined, ReloadOutlined, QuestionCircleOutlined, PictureOutlined,
} from "@ant-design/icons";
import { useStore } from "./store";
import { api } from "./api";
import { GraphCanvas } from "./components/GraphCanvas";
import { LearningPage } from "./components/LearningPage";
import { Sidebar } from "./components/Sidebar";
import { DetailPanel } from "./components/DetailPanel";

const SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: "Ctrl / ⌘ + K", desc: "搜索知识点" },
  { keys: "Esc", desc: "关闭弹窗 / 返回目录 / 清除选中" },
  { keys: "F", desc: "适配全图（图谱模式）" },
  { keys: "+  /  -", desc: "放大 / 缩小画布" },
  { keys: "Enter", desc: "定位到选中节点" },
  { keys: "1  2", desc: "知识域布局 / 版本时间线" },
  { keys: "W", desc: "显示 / 隐藏弱关联边" },
  { keys: "G", desc: "聚焦 2 跳 / 全部" },
  { keys: "[  /  ]", desc: "上一个 / 下一个知识点" },
  { keys: "M", desc: "显示 / 隐藏小地图" },
  { keys: "?", desc: "打开本快捷键说明" },
];

export default function App() {
  const {
    graph, detail, detailLoading, detailError, progress, stats, selectedId, loading,
    viewMode, setViewMode,
    layoutMode, setLayout, load, select,
    showWeakEdges, setShowWeakEdges, focusMode, setFocusMode,
    sidebarWidth, setSidebarWidth, detailWidth, setDetailWidth,
    showMinimap, setShowMinimap,
    shortcutsOpen, setShortcutsOpen,
    readerId, closeReader,
    canvasApi,
  } = useStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; label: string; domain: string; summary: string }[]>([]);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const t = setTimeout(async () => {
      if (!q.trim()) { setHits([]); return; }
      const r = await api.search(q.trim());
      setHits(r.results);
    }, 200);
    return () => clearTimeout(t);
  }, [q, searchOpen]);

  // ── 面板拖拽 ────────────────────────────────
  const dragRef = useRef<{ kind: "side" | "detail"; x: number; w: number } | null>(null);

  const onResizeStart = (kind: "side" | "detail") => (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = {
      kind,
      x: e.clientX,
      w: kind === "side" ? sidebarWidth : detailWidth,
    };
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const delta = ev.clientX - d.x;
      if (d.kind === "side") setSidebarWidth(d.w + delta);
      else setDetailWidth(d.w - delta);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  // ── 学习路径上一个 / 下一个 ──────────────────
  const stepNode = useCallback((dir: 1 | -1) => {
    const st = useStore.getState();
    const g = st.graph;
    if (!g) return;
    const sorted = g.nodes.slice().sort((a, b) => {
      const da = g.domains.findIndex((d) => d.id === a.domain);
      const db = g.domains.findIndex((d) => d.id === b.domain);
      return da - db || a.order - b.order;
    });
    const idx = sorted.findIndex((n) => n.id === st.selectedId);
    const next = idx < 0
      ? (dir === 1 ? sorted[0] : sorted[sorted.length - 1])
      : sorted[(idx + dir + sorted.length) % sorted.length];
    if (next) st.select(next.id);
  }, []);

  // ── 全局快捷键 ──────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable
      );
      const st = useStore.getState();

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (typing) return;

      if (e.key === "Escape") {
        if (st.shortcutsOpen) { setShortcutsOpen(false); return; }
        if (searchOpen) { setSearchOpen(false); return; }
        if (st.readerId) { closeReader(); return; }
        if (st.selectedId) st.select(null);
        return;
      }
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      const k = e.key.toLowerCase();
      if (k === "f") { e.preventDefault(); canvasApi?.fit(); }
      else if (e.key === "+" || e.key === "=") { e.preventDefault(); canvasApi?.zoomIn(); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); canvasApi?.zoomOut(); }
      else if (e.key === "Enter") { e.preventDefault(); canvasApi?.focusSelected(); }
      else if (k === "1") st.setLayout("cluster");
      else if (k === "2") st.setLayout("timeline");
      else if (k === "w") st.setShowWeakEdges(!st.showWeakEdges);
      else if (k === "g") st.setFocusMode(!st.focusMode);
      else if (k === "m") st.setShowMinimap(!st.showMinimap);
      else if (e.key === "[") { e.preventDefault(); stepNode(-1); }
      else if (e.key === "]") { e.preventDefault(); stepNode(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canvasApi, searchOpen, stepNode, setSearchOpen, setShortcutsOpen, closeReader]);

  if (loading) {
    return (
      <div className="app" style={{ alignItems: "center", justifyContent: "center" }}>
        <Spin size="large" tip="加载知识图谱…" />
      </div>
    );
  }
  if (!graph) {
    return <div className="app"><Empty description="后端未连接" /></div>;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">YOLO <span>知识图谱</span></div>
        <Segmented
          value={viewMode}
          onChange={(v) => setViewMode(v as "graph" | "learn")}
          options={[
            { label: "图谱视图", value: "graph" },
            { label: "学习页面", value: "learn" },
          ]}
        />
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索知识点… (Ctrl+K)"
          value={q}
          onFocus={() => setSearchOpen(true)}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: 220 }}
          allowClear
        />
        {viewMode === "graph" && (
          <>
            <Segmented
              value={layoutMode}
              onChange={(v) => setLayout(v as "cluster" | "timeline")}
              options={[
                { label: "知识域", value: "cluster" },
                { label: "版本时间线", value: "timeline" },
              ]}
            />
            <Segmented
              value={focusMode ? "focus" : "all"}
              onChange={(v) => setFocusMode(v === "focus")}
              options={[
                { label: "聚焦 2 跳", value: "focus" },
                { label: "全部", value: "all" },
              ]}
            />
            <span
              className="chip"
              style={{ cursor: "pointer", opacity: showWeakEdges ? 1 : 0.55 }}
              onClick={() => setShowWeakEdges(!showWeakEdges)}
            >
              {showWeakEdges ? "隐藏弱关联" : "显示弱关联"}
            </span>
          </>
        )}
        <div className="spacer" />
        <Tooltip title={showMinimap ? "隐藏小地图 (M)" : "显示小地图 (M)"}>
          <Button
            size="small"
            icon={<PictureOutlined />}
            type={showMinimap ? "default" : "text"}
            onClick={() => setShowMinimap(!showMinimap)}
          />
        </Tooltip>
        <Tooltip title="快捷键 (?)">
          <Button size="small" icon={<QuestionCircleOutlined />} onClick={() => setShortcutsOpen(true)} />
        </Tooltip>
        <div className="progress-pill">
          已掌握 <b>{stats?.percent ?? 0}%</b>
          {" "}({stats?.learned ?? 0}/{stats?.total ?? 0})
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => load()} size="small" />
      </header>

      <div className="main">
        <div className="side-wrap" style={{ width: sidebarWidth }}>
          <Sidebar onSelect={select} selectedId={selectedId} />
        </div>
        <div className="resizer" onMouseDown={onResizeStart("side")} title="拖拽调整宽度" />
        <div className="canvas-wrap">
          {viewMode === "graph" ? (
            <GraphCanvas onSelect={select} />
          ) : (
            <LearningPage />
          )}
        </div>
        {viewMode === "graph" && (
          <>
            <div className="resizer" onMouseDown={onResizeStart("detail")} title="拖拽调整宽度" />
            <div className="detail-wrap" style={{ width: detailWidth }}>
              <DetailPanel
                detail={detail}
                loading={detailLoading}
                error={detailError}
                progress={progress}
                onSelect={select}
              />
            </div>
          </>
        )}
      </div>

      <Modal
        open={searchOpen}
        onCancel={() => setSearchOpen(false)}
        footer={null}
        title="搜索知识点"
        width={560}
        styles={{ body: { maxHeight: 420, overflowY: "auto" } }}
      >
        <Input
          autoFocus
          placeholder="输入关键词，如 NMS / TensorRT / 深度 / YOLO26"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          allowClear
        />
        <div style={{ marginTop: 12 }}>
          {hits.length === 0 && (
            <div className="empty" style={{ padding: 24 }}>
              {q.trim() ? "无匹配结果" : "输入关键词开始搜索"}
            </div>
          )}
          {hits.map((h) => (
            <div
              key={h.id}
              className="search-hit"
              onClick={() => {
                select(h.id);
                setSearchOpen(false);
              }}
            >
              <div className="t">{h.label}</div>
              <div className="s">{h.summary}</div>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        open={shortcutsOpen}
        onCancel={() => setShortcutsOpen(false)}
        footer={null}
        title="键盘快捷键"
        width={420}
      >
        <div className="shortcut-list">
          {SHORTCUTS.map((s) => (
            <div className="shortcut-row" key={s.keys}>
              <kbd>{s.keys}</kbd>
              <span>{s.desc}</span>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

```

### `frontend/src/components/Sidebar.tsx`

```tsx
import { useStore } from "../store";

interface Props {
  onSelect: (id: string | null) => void;
  selectedId: string | null;
}

export function Sidebar({ onSelect, selectedId }: Props) {
  const {
    graph, stats, progress, domainFilter, setDomainFilter,
    taskFilter, setTaskFilter, viewMode,
  } = useStore();
  if (!graph) return null;

  // 「继续学习」：在学优先，否则按学习顺序第一个未学
  const sorted = graph.nodes.slice().sort((a, b) => {
    const da = graph.domains.findIndex((d) => d.id === a.domain);
    const db = graph.domains.findIndex((d) => d.id === b.domain);
    return da - db || a.order - b.order;
  });
  const nextNode =
    sorted.find((n) => progress[n.id] === "learning") ||
    sorted.find((n) => (progress[n.id] || "unlearned") === "unlearned");

  return (
    <aside className="sidebar">
      <h3>任务</h3>
      <div className="task-chips">
        {[
          { id: null, label: "全部" },
          { id: "detect", label: "检测" },
          { id: "inst_seg", label: "实例分割" },
          { id: "sem_seg", label: "语义分割" },
          { id: "depth", label: "深度估计" },
        ].map((t) => (
          <span
            key={String(t.id)}
            className={`chip ${taskFilter === t.id ? "blue" : ""}`}
            style={{ cursor: "pointer" }}
            onClick={() => setTaskFilter(t.id)}
          >
            {t.label}
          </span>
        ))}
      </div>

      <h3>知识域</h3>
      <div
        className={`domain-item ${!domainFilter ? "active" : ""}`}
        onClick={() => setDomainFilter(null)}
      >
        <div className="dot" style={{ background: "#64748b" }} />
        <span>全部</span>
        <span className="count">{graph.nodes.length}</span>
      </div>
      {graph.domains.map((d) => {
        const st = stats?.domains?.[d.id];
        const pct = st && st.total ? Math.round((st.learned / st.total) * 100) : 0;
        return (
          <div key={d.id} className="domain-group">
            <div
              className={`domain-item ${domainFilter === d.id ? "active" : ""}`}
              onClick={() => setDomainFilter(domainFilter === d.id ? null : d.id)}
              title={d.description}
            >
              <div className="dot" style={{ background: d.color }} />
              <span>{d.label}</span>
              <span className="count">{st ? `${st.learned}/${st.total}` : "0/0"}</span>
            </div>
            <div className="domain-bar">
              <div className="domain-bar-fill" style={{ width: `${pct}%`, background: d.color }} />
            </div>
          </div>
        );
      })}

      {nextNode && (
        <>
          <h3>继续学习</h3>
          <div
            className={`path-focus next ${selectedId === nextNode.id ? "active" : ""}`}
            onClick={() => onSelect(nextNode.id)}
          >
            <div className="path-focus-tag">
              {progress[nextNode.id] === "learning" ? "在学 · 距离最近" : "下一步"}
            </div>
            <div className="path-focus-label">{nextNode.label}</div>
            <div className="path-focus-sub">{nextNode.summary.slice(0, 28)}…</div>
          </div>
        </>
      )}

      {viewMode === "graph" ? (
        <p className="sidebar-hint">
          图谱模式：拖拽 / 缩放探索关系。<br />按 <kbd>?</kbd> 查看快捷键。
        </p>
      ) : (
        <p className="sidebar-hint">
          学习模式：点域跳到章节。<br />点击卡片进入阅读页（可返回）。
        </p>
      )}
    </aside>
  );
}

```

### `frontend/src/components/LearningPage.tsx`

```tsx
import { useEffect, useRef, useState } from "react";
import { Progress } from "antd";
import { useStore } from "../store";
import { LearningReader } from "./LearningReader";

const TYPE_ZH: Record<string, string> = {
  concept: "概念", version: "版本", technique: "技巧",
  tool: "工具", task: "任务", practice: "实战",
};
const DIFF = ["", "★", "★★", "★★★"];
const STATUS_ZH: Record<string, string> = {
  learned: "已掌握", learning: "在学", unlearned: "未学",
};

export function LearningPage() {
  const {
    graph, stats, progress, selectedId, domainFilter, taskFilter,
    readerId, detail, detailLoading, detailError,
    select, openReader, closeReader,
  } = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);

  // 目录状态下：侧栏点域 → 滚动到章节
  useEffect(() => {
    if (readerId || !domainFilter) return;
    const el = document.getElementById(`learn-sec-${domainFilter}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [domainFilter, readerId]);

  if (!graph) return null;

  // ── 阅读态 ──────────────────────────────
  if (readerId) {
    return (
      <div className="learn-page reader-mode" ref={scrollRef}>
        <LearningReader
          detail={detail}
          loading={detailLoading}
          error={detailError}
          progress={progress}
          onBack={() => {
            closeReader();
            // 返回目录后恢复滚动位置
            requestAnimationFrame(() => {
              scrollRef.current?.scrollTo({ top: savedScroll.current });
            });
          }}
        />
      </div>
    );
  }

  // ── 目录态 ──────────────────────────────
  const order = graph.domains;
  const nodesByDomain = (id: string) =>
    graph.nodes
      .filter((n) => n.domain === id && (!taskFilter || n.tasks.includes(taskFilter)))
      .sort((a, b) => a.order - b.order);

  const enterReader = (id: string) => {
    savedScroll.current = scrollRef.current?.scrollTop || 0;
    openReader(id);
  };

  return (
    <div className="learn-page" ref={scrollRef}>
      <header className="learn-hero">
        <h1>YOLO 学习路线</h1>
        <p>
          从基础理论到项目实战，共 {graph.nodes.length} 个知识点 ·
          按「打地基 → 顺脉络 → 拆架构 → 进任务 → 上工程 → 落实战」推进
        </p>
        <div className="learn-hero-progress">
          <Progress
            percent={stats?.percent ?? 0}
            showInfo
            strokeColor="#3b82f6"
            trailColor="#212832"
          />
          <span className="learn-hero-sub">
            已掌握 {stats?.learned ?? 0} · 在学 {stats?.learning ?? 0} · 未学{" "}
            {graph.nodes.length - (stats?.learned ?? 0) - (stats?.learning ?? 0)}
          </span>
        </div>
      </header>

      {order.map((d) => {
        const nodes = nodesByDomain(d.id);
        if (nodes.length === 0) return null;
        const st = stats?.domains?.[d.id];
        const pct = st && st.total ? Math.round((st.learned / st.total) * 100) : 0;
        return (
          <section key={d.id} id={`learn-sec-${d.id}`} className="learn-section">
            <div className="learn-section-head">
              <div className="learn-section-title">
                <span className="learn-dot" style={{ background: d.color }} />
                <h2>{d.label}</h2>
                <span className="learn-count">{st ? `${st.learned}/${st.total}` : nodes.length}</span>
              </div>
              <p>{d.description}</p>
              <div className="learn-bar">
                <div className="learn-bar-fill" style={{ width: `${pct}%`, background: d.color }} />
              </div>
            </div>

            <div className="learn-grid">
              {nodes.map((n) => {
                const stt = progress[n.id] || "unlearned";
                return (
                  <article
                    key={n.id}
                    className={`learn-card st-${stt}`}
                    onClick={() => enterReader(n.id)}
                  >
                    <div className="learn-card-top">
                      <span className={`st st-${stt}`} title={STATUS_ZH[stt]} />
                      <h3>{n.label}</h3>
                    </div>
                    <div className="learn-card-meta">
                      <span className="chip">{TYPE_ZH[n.type] || n.type}</span>
                      <span className="chip purple">{DIFF[n.difficulty] || "★★"}</span>
                      {n.year ? <span className="chip blue">{n.year}</span> : null}
                    </div>
                    <p>{n.summary}</p>
                    <div className="learn-card-tags">
                      {n.tasks.slice(0, 3).map((t) => (
                        <span key={t} className="chip green">{t}</span>
                      ))}
                    </div>
                    <div className="learn-card-cta">进入阅读 →</div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}

      <footer className="learn-foot">
        他山之石，可以攻玉 —— 点击卡片进入阅读页；「图谱视图」用于探索知识之间的关系。
      </footer>
    </div>
  );
}

```

### `frontend/src/components/LearningReader.tsx`

```tsx
import { Button, message, Skeleton, Alert } from "antd";
import {
  ArrowLeftOutlined, LeftOutlined, RightOutlined,
  CheckOutlined, Loading3QuartersOutlined, UndoOutlined,
} from "@ant-design/icons";
import type { NodeDetail, ProgressMap } from "../types";
import { useStore } from "../store";
import { MarkdownBody } from "./MarkdownBody";

const TYPE_ZH: Record<string, string> = {
  concept: "概念", version: "版本", technique: "技巧",
  tool: "工具", task: "任务", practice: "实战",
};
const TASK_ZH: Record<string, string> = {
  detect: "目标检测", inst_seg: "实例分割", sem_seg: "语义分割",
  depth: "深度估计", classify: "图像分类", pose: "姿态估计",
  obb: "旋转框", track: "多目标跟踪",
};
const DIFF_LABEL = ["", "★ 入门", "★★ 进阶", "★★★ 深入"];

interface Props {
  detail: NodeDetail | null;
  loading: boolean;
  error: string | null;
  progress: ProgressMap;
  onBack: () => void;
}

export function LearningReader({ detail, loading, error, progress, onBack }: Props) {
  const { graph, select, setProgress, openReader } = useStore();

  if (!graph) return null;

  // 当前节点缺失（加载中/出错）时的兜底 id
  const id = detail?.id || useStore.getState().readerId;
  const sorted = graph.nodes.slice().sort((a, b) => {
    const da = graph.domains.findIndex((d) => d.id === a.domain);
    const db = graph.domains.findIndex((d) => d.id === b.domain);
    return da - db || a.order - b.order;
  });
  const idx = sorted.findIndex((n) => n.id === id);
  const prev = idx > 0 ? sorted[idx - 1] : null;
  const next = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;

  const status = detail ? (progress[detail.id] || "unlearned") : "unlearned";
  const domainInfo = detail
    ? graph.domains.find((d) => d.id === detail.domain)
    : null;

  const update = async (s: "unlearned" | "learning" | "learned") => {
    if (!detail) return;
    try {
      await setProgress(detail.id, s);
      message.success(s === "learned" ? "已标记为掌握" : s === "learning" ? "已标记为在学" : "已重置");
    } catch {
      message.error("进度保存失败");
    }
  };

  return (
    <div className="reader">
      {/* 顶栏：返回 + 面包屑 + 上下节 */}
      <div className="reader-bar">
        <Button size="small" icon={<ArrowLeftOutlined />} onClick={onBack}>
          返回目录
        </Button>
        <nav className="reader-crumb">
          <span onClick={onBack}>学习路线</span>
          {domainInfo && (
            <>
              <span className="sep">/</span>
              <span>{domainInfo.label}</span>
            </>
          )}
          {detail && (
            <>
              <span className="sep">/</span>
              <span className="cur">{detail.label}</span>
            </>
          )}
        </nav>
        <div className="reader-nav">
          <Button
            size="small"
            icon={<LeftOutlined />}
            disabled={!prev}
            onClick={() => prev && openReader(prev.id)}
          >
            上一节
          </Button>
          <Button
            size="small"
            disabled={!next}
            onClick={() => next && openReader(next.id)}
          >
            下一节 <RightOutlined />
          </Button>
        </div>
      </div>

      {/* 状态反馈 */}
      {loading && (
        <div className="reader-body">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      )}
      {error && !loading && (
        <div className="reader-body">
          <Alert
            type="error"
            message={error}
            showIcon
            action={<Button size="small" onClick={() => id && select(id)}>重试</Button>}
          />
        </div>
      )}

      {/* 正文 */}
      {detail && !loading && (
        <article className="reader-body">
          <header className="reader-head">
            <div className="reader-meta">
              {domainInfo && (
                <span className="chip" style={{ color: domainInfo.color, borderColor: domainInfo.color }}>
                  {domainInfo.label}
                </span>
              )}
              <span className="chip">{TYPE_ZH[detail.type] || detail.type}</span>
              <span className="chip purple">{DIFF_LABEL[detail.difficulty] || "★★"}</span>
              {detail.tasks.slice(0, 3).map((t) => (
                <span key={t} className="chip green">{TASK_ZH[t] || t}</span>
              ))}
              {detail.tasks.length > 3 && <span className="chip">+{detail.tasks.length - 3}</span>}
            </div>

            <h1>{detail.label}</h1>
            <p className="reader-summary">{detail.summary}</p>

            <div className="reader-actions">
              {status !== "learned" && (
                <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => update("learned")}>
                  标记已掌握
                </Button>
              )}
              {status !== "learning" && status !== "learned" && (
                <Button size="small" icon={<Loading3QuartersOutlined />} onClick={() => update("learning")}>
                  在学
                </Button>
              )}
              {status !== "unlearned" && (
                <Button size="small" icon={<UndoOutlined />} onClick={() => update("unlearned")}>
                  重置
                </Button>
              )}
            </div>
          </header>

          <MarkdownBody content={detail.content} />

          {/* 相关知识 */}
          {(detail.related.prereq.length > 0 ||
            detail.related.next.length > 0 ||
            detail.related.related.length > 0) && (
            <footer className="reader-related">
              <div className="section-label">关联知识</div>
              {detail.related.prereq.length > 0 && (
                <div className="related-row">
                  <span className="related-tag">先修</span>
                  {detail.related.prereq.map((r) => (
                    <span key={r.id} className="related-item" onClick={() => openReader(r.id)}>{r.label}</span>
                  ))}
                </div>
              )}
              {detail.related.next.length > 0 && (
                <div className="related-row">
                  <span className="related-tag">后继</span>
                  {detail.related.next.map((r) => (
                    <span key={r.id} className="related-item" onClick={() => openReader(r.id)}>{r.label}</span>
                  ))}
                </div>
              )}
              {detail.related.related.length > 0 && (
                <div className="related-row">
                  <span className="related-tag">相关</span>
                  {detail.related.related.slice(0, 8).map((r, i) => (
                    <span key={r.id + i} className="related-item" onClick={() => openReader(r.id)}>{r.label}</span>
                  ))}
                </div>
              )}
            </footer>
          )}

          <div className="reader-foot-nav">
            {prev ? (
              <Button icon={<LeftOutlined />} onClick={() => openReader(prev.id)}>
                {prev.label}
              </Button>
            ) : <span />}
            {next ? (
              <Button type="primary" onClick={() => openReader(next.id)}>
                {next.label} <RightOutlined />
              </Button>
            ) : <span />}
          </div>
        </article>
      )}
    </div>
  );
}

```

### `frontend/src/components/MarkdownBody.tsx`

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

const STUB_SECTIONS = [
  "这是什么",
  "为什么需要它",
  "怎么用 / 关键细节",
  "常见坑",
  "延伸与关联",
];

function isStub(md: string): boolean {
  return md.includes("（待补充");
}

/** 去掉正文里与面板重复的一级标题与摘要 */
export function stripDup(md: string): string {
  const lines = md.split("\n");
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t === "") { i++; continue; }
    if (t.startsWith("# ")) { i++; continue; }
    if (t.startsWith("> ")) { i++; continue; }
    break;
  }
  return lines.slice(i).join("\n").trim();
}

interface Props {
  content: string;
  /** 是否剥离正文开头重复的标题/摘要 */
  stripHeader?: boolean;
}

export function MarkdownBody({ content, stripHeader = true }: Props) {
  const body = stripHeader ? stripDup(content) : content;

  if (isStub(body)) {
    return (
      <div className="stub-state">
        <div className="stub-badge">内容建设中</div>
        <p>这一节已建立知识骨架，正文正在补充。建议按以下栏目完善：</p>
        <ul className="stub-list">
          {STUB_SECTIONS.map((s) => (
            <li key={s}>
              <span className="stub-check" />
              {s}
            </li>
          ))}
        </ul>
        <p className="stub-hint">
          正文文件位于 <code>backend/data/content/</code>，编辑后刷新即可生效。
        </p>
      </div>
    );
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
    >
      {body}
    </ReactMarkdown>
  );
}

```

### `frontend/src/components/DetailPanel.tsx`

```tsx
import { Button, message, Skeleton, Alert } from "antd";
import {
  CheckOutlined, Loading3QuartersOutlined, UndoOutlined, ReadOutlined,
} from "@ant-design/icons";
import type { NodeDetail, ProgressMap } from "../types";
import { useStore } from "../store";

interface Props {
  detail: NodeDetail | null;
  loading: boolean;
  error: string | null;
  progress: ProgressMap;
  onSelect: (id: string | null) => void;
}

const DIFF_LABEL = ["", "★ 入门", "★★ 进阶", "★★★ 深入"];
const TYPE_ZH: Record<string, string> = {
  concept: "概念", version: "版本", technique: "技巧",
  tool: "工具", task: "任务", practice: "实战",
};
const TASK_ZH: Record<string, string> = {
  detect: "目标检测", inst_seg: "实例分割", sem_seg: "语义分割",
  depth: "深度估计", classify: "图像分类", pose: "姿态估计",
  obb: "旋转框", track: "多目标跟踪",
};

export function DetailPanel({ detail, loading, error, progress, onSelect }: Props) {
  const setProgress = useStore((s) => s.setProgress);
  const openReader = useStore((s) => s.openReader);

  if (loading) {
    return (
      <aside className="detail">
        <div style={{ padding: 16 }}>
          <Skeleton active paragraph={{ rows: 5 }} />
        </div>
      </aside>
    );
  }

  if (error) {
    return (
      <aside className="detail">
        <div style={{ padding: 16 }}>
          <Alert
            type="error"
            message={error}
            showIcon
            action={
              <Button size="small" onClick={() => detail?.id && useStore.getState().select(detail.id)}>
                重试
              </Button>
            }
          />
        </div>
      </aside>
    );
  }

  if (!detail) {
    return (
      <aside className="detail">
        <div className="empty">
          <h3>点击图谱节点</h3>
          <p>这里显示简要检查信息，完整内容在阅读页</p>
          <p style={{ fontSize: 12, marginTop: 16, lineHeight: 1.9 }}>
            按 <kbd>?</kbd> 查看快捷键 · 学习内容请到「学习页面」
          </p>
        </div>
      </aside>
    );
  }

  const status = progress[detail.id] || "unlearned";
  const domainInfo = useStore.getState().graph?.domains.find((d) => d.id === detail.domain);
  const domainColor = domainInfo?.color || "#64748b";

  const update = async (s: "unlearned" | "learning" | "learned") => {
    try {
      await setProgress(detail.id, s);
      message.success(s === "learned" ? "已标记为掌握" : s === "learning" ? "已标记为在学" : "已重置");
    } catch {
      message.error("进度保存失败");
    }
  };

  return (
    <aside className="detail">
      <div className="detail-head">
        <h2>{detail.label}</h2>
        <div className="meta">
          <span className="chip" style={{ color: domainColor, borderColor: domainColor }}>
            {domainInfo?.label || detail.domain}
          </span>
          <span className="chip">{TYPE_ZH[detail.type] || detail.type}</span>
          <span className="chip purple">{DIFF_LABEL[detail.difficulty] || "★★"}</span>
          {detail.tasks.slice(0, 3).map((t) => (
            <span key={t} className="chip green">{TASK_ZH[t] || t}</span>
          ))}
          {detail.tasks.length > 3 && <span className="chip">+{detail.tasks.length - 3}</span>}
        </div>
        <div className="detail-actions">
          {status !== "learned" && (
            <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => update("learned")}>
              已掌握
            </Button>
          )}
          {status !== "learning" && status !== "learned" && (
            <Button size="small" icon={<Loading3QuartersOutlined />} onClick={() => update("learning")}>
              在学
            </Button>
          )}
          {status !== "unlearned" && (
            <Button size="small" icon={<UndoOutlined />} onClick={() => update("unlearned")}>
              重置
            </Button>
          )}
        </div>
      </div>

      {/* 核心理解 */}
      <div className="detail-summary">
        <div className="section-label">核心理解</div>
        <p>{detail.summary}</p>
      </div>

      {/* 完整内容入口（图谱模式不展开正文） */}
      <div className="detail-open">
        <Button
          type="primary"
          block
          icon={<ReadOutlined />}
          onClick={() => openReader(detail.id)}
        >
          阅读完整内容
        </Button>
      </div>

      {/* 关联（点击继续探索） */}
      {(detail.related.prereq.length > 0 || detail.related.next.length > 0 || detail.related.related.length > 0) && (
        <div className="detail-related">
          {detail.related.prereq.length > 0 && (
            <>
              <div className="section-label">先修</div>
              <div className="related-row">
                {detail.related.prereq.map((r) => (
                  <span key={r.id} className="related-item" onClick={() => onSelect(r.id)}>{r.label}</span>
                ))}
              </div>
            </>
          )}
          {detail.related.next.length > 0 && (
            <>
              <div className="section-label">后继 · 推荐下一步</div>
              <div className="related-row">
                {detail.related.next.map((r) => (
                  <span key={r.id} className="related-item" onClick={() => onSelect(r.id)}>{r.label}</span>
                ))}
              </div>
            </>
          )}
          {detail.related.related.length > 0 && (
            <>
              <div className="section-label">相关</div>
              <div className="related-row">
                {detail.related.related.slice(0, 10).map((r, i) => (
                  <span key={r.id + i} className="related-item" onClick={() => onSelect(r.id)}>{r.label}</span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
}

```

### `frontend/src/components/GraphCanvas.tsx`

```tsx
import { useEffect, useRef, useCallback } from "react";
import { Graph } from "@antv/g6";
import { useStore } from "../store";
import type { GraphData } from "../types";

/** 强关系边默认显示；弱关系（related/uses）默认隐藏，避免蛛网 */
const STRONG_EDGE_TYPES = new Set(["evolved", "prereq", "part_of", "improves"]);

const EDGE_STYLE: Record<string, { stroke: string; width: number; dash?: number[]; alpha: number; label: string }> = {
  evolved:  { stroke: "#3b82f6", width: 2.2, alpha: 0.85, label: "演进" },
  prereq:   { stroke: "#22c55e", width: 1.6, dash: [6, 4], alpha: 0.7, label: "先修" },
  part_of:  { stroke: "#a855f7", width: 1.4, alpha: 0.55, label: "组成" },
  improves: { stroke: "#f59e0b", width: 1.4, alpha: 0.55, label: "改进" },
  uses:     { stroke: "#06b6d4", width: 1.0, alpha: 0.32, label: "使用" },
  related:  { stroke: "#64748b", width: 0.8, alpha: 0.2, label: "相关" },
};

const DIM_FILL = 0.38;   // 聚焦模式下非邻域节点（保留空间上下文）
const DIM_LABEL = 0.35;

function neighborSets(edges: { source: string; target: string }[], id: string, hops = 1) {
  const near = new Set<string>([id]);
  let frontier = new Set<string>([id]);
  for (let h = 0; h < hops; h++) {
    const next = new Set<string>();
    for (const e of edges) {
      if (frontier.has(e.source) && !near.has(e.target)) { next.add(e.target); near.add(e.target); }
      if (frontier.has(e.target) && !near.has(e.source)) { next.add(e.source); near.add(e.source); }
    }
    frontier = next;
  }
  return near;
}

function clusterLayout(graph: GraphData) {
  const cols = 4;
  const cellW = 410;
  const cellH = 350;
  const innerCols = 3;
  const gapX = 112;
  const gapY = 78;
  const pos: Record<string, { x: number; y: number }> = {};
  const blocks: Record<string, { x: number; y: number; w: number; h: number }> = {};

  graph.domains.forEach((d, di) => {
    const nodes = graph.nodes
      .filter((n) => n.domain === d.id)
      .sort((a, b) => a.order - b.order);
    const col = di % cols;
    const row = Math.floor(di / cols);
    const ox = 70 + col * cellW;
    const oy = 50 + row * cellH;
    const rows = Math.ceil(nodes.length / innerCols);
    const blockW = Math.max(innerCols * gapX + 40, 240);
    const blockH = Math.max(rows * gapY + 80, 140);
    blocks[d.id] = { x: ox, y: oy, w: blockW, h: blockH };
    nodes.forEach((n, ni) => {
      const r = Math.floor(ni / innerCols);
      const c = ni % innerCols;
      pos[n.id] = { x: ox + 70 + c * gapX, y: oy + 84 + r * gapY };
    });
  });
  return { pos, blocks };
}

/** 版本时间线：只放真实年份的里程碑；同年纵向堆叠，不伪造 2015 */
function timelineLayout(graph: GraphData) {
  const pos: Record<string, { x: number; y: number }> = {};
  const yearHeader: Record<string, { x: number; year: number }> = {};

  const withYear = graph.nodes.filter((n) => n.year != null);
  const years = [...new Set(withYear.map((n) => n.year as number))].sort((a, b) => a - b);
  const colW = 280;

  years.forEach((y, yi) => {
    const x = 160 + yi * colW;
    yearHeader[`__year_${y}`] = { x, year: y };
    const col = withYear
      .filter((n) => n.year === y)
      .sort((a, b) => a.order - b.order);
    col.forEach((n, i) => {
      pos[n.id] = { x, y: 170 + i * 130 };
    });
  });
  return { pos, blocks: {} as Record<string, never>, yearHeader };
}

/** 语义缩放：根据缩放比例决定标签显示层级 */
function labelLevel(zoom: number): 0 | 1 | 2 {
  if (zoom < 0.55) return 0;   // 全局：只显示域标题与版本节点
  if (zoom < 1.1) return 1;    // 域视图：版本 + 重点概念
  return 2;                    // 局部：全部标签
}

interface Props {
  onSelect: (id: string | null) => void;
}

export function GraphCanvas({ onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const zoomLevel = useRef(2);
  const {
    graph, progress, selectedId, layoutMode,
    domainFilter, taskFilter,
    showWeakEdges, focusMode, showMinimap, setCanvasApi,
  } = useStore();

  /** 更新标签可见性（不重建图，保留视口） */
  const applyLabelLevel = useCallback((g: Graph, level: number) => {
    const data = g.getData();
    if (!data?.nodes) return;
    const nodes = data.nodes.map((n: any) => {
      const isVersion = n.data?.type === "version";
      const selected = n.id === selectedId;
      const isHeader = String(n.id).startsWith("__domain_");
      if (isHeader) return n;
      const show =
        level >= 2 ||
        (level === 1 && (isVersion || selected || n.data?.difficulty === 1)) ||
        (level === 0 && (isVersion || selected));
      return {
        ...n,
        style: {
          ...n.style,
          labelText: show ? n.data?.label : "",
          labelFillOpacity: show ? (n.style?.labelFillOpacity ?? 1) : 0,
        },
      };
    });
    g.setData({ nodes, edges: data.edges });
    g.draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ── 图实例只创建一次 ──────────────────────────
  useEffect(() => {
    if (!graph || !containerRef.current) return;

    const g = new Graph({
      container: containerRef.current,
      data: { nodes: [], edges: [] },
      autoFit: "view",
      padding: 50,
      node: { style: {} },
      edge: { style: {} },
      behaviors: [
        "drag-canvas",
        "zoom-canvas",
        "drag-element",
        { type: "hover-activate", enable: true, trigger: ["node"] },
      ],
      plugins: [
        {
          key: "kg-minimap",
          type: "minimap",
          size: [180, 112],
          position: "right-top",
          className: "kg-minimap",
          containerStyle: {
            background: "rgba(26,32,41,0.92)",
            border: "1px solid #2a323d",
            borderRadius: "10px",
            overflow: "hidden",
            boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
          } as any,
          maskStyle: {
            fill: "rgba(59,130,246,0.18)",
            stroke: "#3b82f6",
            lineWidth: 1,
          } as any,
        },
      ],
    });

    g.on("node:click", (e: any) => {
      const id = e.target?.id ?? e.target?.getDatum?.()?.id;
      if (id && !String(id).startsWith("__domain_")) onSelect(String(id));
    });

    // 语义缩放：只改标签，不重建图
    let raf = 0;
    const onZoomChanged = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        let z = 1;
        try { z = (g as any).getZoom?.() ?? 1; } catch { /* ignore */ }
        const lv = labelLevel(z);
        if (lv !== zoomLevel.current) {
          zoomLevel.current = lv;
          applyLabelLevel(g, lv);
        }
      });
    };
    // G6 5.x 不同小版本事件名不同，多重兜底
    (g as any).on("viewport-change", onZoomChanged);
    (g as any).on("aftertransform", onZoomChanged);
    const dom = containerRef.current;
    dom?.addEventListener("wheel", onZoomChanged, { passive: true });

    graphRef.current = g;

    // 供键盘快捷键调用
    setCanvasApi({
      fit: () => { try { (g as any).fitView?.(); } catch { /* ignore */ } },
      zoomIn: () => {
        try {
          const cur = (g as any).getZoom?.() ?? 1;
          (g as any).zoomTo(Math.min(3, cur * 1.25));
        } catch { /* ignore */ }
      },
      zoomOut: () => {
        try {
          const cur = (g as any).getZoom?.() ?? 1;
          (g as any).zoomTo(Math.max(0.2, cur * 0.8));
        } catch { /* ignore */ }
      },
      focusSelected: () => {
        const id = useStore.getState().selectedId;
        if (!id) return;
        try {
          const d = (g as any).getNodeData?.(id);
          const x = d?.style?.x ?? d?.data?.x;
          const y = d?.style?.y ?? d?.data?.y;
          if (x != null && y != null) {
            (g as any).zoomTo(1.25);
            (g as any).translateTo?.({ x, y });
          }
        } catch { /* ignore */ }
      },
    });

    return () => {
      dom?.removeEventListener("wheel", onZoomChanged);
      setCanvasApi(null);
      g.destroy();
      graphRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // ── 数据 / 筛选 / 选中变化：原地更新，不重置视口 ──
  useEffect(() => {
    const g = graphRef.current;
    if (!g || !graph) return;

    const domainColor = Object.fromEntries(graph.domains.map((d) => [d.id, d.color]));
    const visibleIds = new Set(
      graph.nodes
        .filter(
          (n) =>
            (!domainFilter || n.domain === domainFilter) &&
            (!taskFilter || n.tasks.includes(taskFilter))
        )
        .map((n) => n.id)
    );

    let edgesRaw = graph.edges.filter(
      (e) => visibleIds.has(e.source) && visibleIds.has(e.target)
    );
    if (!showWeakEdges) {
      edgesRaw = edgesRaw.filter((e) => STRONG_EDGE_TYPES.has(e.type));
    }

    const near = selectedId && focusMode
      ? neighborSets(graph.edges, selectedId, 2)
      : null;

    let pos: Record<string, { x: number; y: number }> = {};
    let blocks: Record<string, { x: number; y: number; w: number; h: number }> = {};
    let yearHeader: Record<string, { x: number; year: number }> = {};

    const isTimeline = layoutMode === "timeline";

    if (layoutMode === "cluster") {
      ({ pos, blocks } = clusterLayout(graph));
    } else if (isTimeline) {
      const tl = timelineLayout(graph);
      pos = tl.pos;
      blocks = tl.blocks;
      yearHeader = tl.yearHeader;
    }

    const level = zoomLevel.current;
    const nodes: any[] = [];

    // 时间线年份刻度（标尺）
    if (isTimeline) {
      Object.entries(yearHeader).forEach(([key, h]) => {
        nodes.push({
          id: key,
          data: { label: String(h.year), isYear: true },
          style: {
            x: h.x, y: 70,
            size: 1,
            fill: "#3b82f6",
            fillOpacity: 0,
            strokeOpacity: 0,
            labelText: String(h.year),
            labelFill: "#60a5fa",
            labelFillOpacity: 0.95,
            labelFontSize: 18,
            labelFontWeight: 700,
            labelPlacement: "bottom" as const,
            labelBackground: true,
            labelBackgroundFill: "#0f1419",
            labelBackgroundFillOpacity: 0.85,
            labelBackgroundRadius: 6,
            labelPadding: [3, 12],
          } as any,
        });
      });
    }

    // 域区块背景（低对比边界，一眼可辨）
    if (layoutMode === "cluster") {
      graph.domains.forEach((d) => {
        const b = blocks[d.id];
        if (!b || !graph.nodes.some((n) => n.domain === d.id && visibleIds.has(n.id))) return;
        const cnt = graph.nodes.filter((n) => n.domain === d.id && visibleIds.has(n.id)).length;
        const st = progress as Record<string, string>;
        const learned = graph.nodes.filter((n) => n.domain === d.id && st[n.id] === "learned").length;
        nodes.push({
          id: `__bg_${d.id}`,
          type: "rect" as any,
          data: { label: "", isBg: true },
          style: {
            x: b.x, y: b.y, width: b.w, height: b.h,
            radius: 14,
            fill: d.color,
            fillOpacity: 0.05,
            stroke: d.color,
            strokeOpacity: 0.28,
            lineWidth: 1,
            cursor: "default",
            labelPlacement: "top" as const,
            labelText: `${d.label}   ${learned}/${cnt}`,
            labelFill: d.color,
            labelFillOpacity: 0.9,
            labelFontSize: 15,
            labelFontWeight: 700,
            labelOffsetY: -14,
            labelBackground: true,
            labelBackgroundFill: "#0f1419",
            labelBackgroundFillOpacity: 0.88,
            labelBackgroundRadius: 6,
            labelPadding: [3, 10],
          } as any,
        });
      });
    }

    // 时间线只显示带年份的里程碑节点
    const visibleNodes = graph.nodes.filter(
      (n) => visibleIds.has(n.id) && (!isTimeline || n.year != null)
    );

    visibleNodes.forEach((n) => {
        const st = progress[n.id] || "unlearned";
        const ring = st === "learned" ? "#22c55e" : st === "learning" ? "#f59e0b" : "#4b5563";
        const selected = n.id === selectedId;
        const inFocus = !near || near.has(n.id);
        const isVersion = n.type === "version";
        const color = domainColor[n.domain] || "#64748b";
        // 时间线节点少，标签常开；其余按语义缩放
        const showLabel = isTimeline
          ? true
          : level >= 2 ||
            (level === 1 && (isVersion || selected || n.difficulty === 1)) ||
            (level === 0 && (isVersion || selected));

        nodes.push({
          id: n.id,
          data: {
            label: n.label, domain: n.domain, domainColor: color,
            difficulty: n.difficulty, summary: n.summary, year: n.year,
            type: n.type, status: st,
          },
          style: {
            x: pos[n.id]?.x, y: pos[n.id]?.y,
            size: selected ? 40 : isTimeline ? 34 : isVersion ? 30 : 22,
            fill: color,
            fillOpacity: inFocus ? 1 : DIM_FILL,
            stroke: selected ? "#ffffff" : ring,
            lineWidth: selected ? 3 : 2,
            strokeOpacity: inFocus ? 1 : 0.45,
            halo: selected,
            haloStroke: selected ? "#3b82f6" : undefined,
            haloStrokeOpacity: 0.45,
            labelText: showLabel ? n.label : "",
            labelFill: selected ? "#ffffff" : "#e6edf3",
            labelFillOpacity: inFocus ? (showLabel ? 1 : 0) : DIM_LABEL,
            labelFontSize: selected ? 14 : isTimeline ? 13 : isVersion ? 11 : 10,
            labelFontWeight: selected ? 600 : isVersion ? 600 : 400,
            labelPlacement: "bottom" as const,
            labelOffsetY: 8,
            labelBackground: true,
            labelBackgroundFill: "#0f1419",
            labelBackgroundFillOpacity: 0.82,
            labelBackgroundRadius: 4,
            labelPadding: [3, 7],
            cursor: "pointer" as const,
          } as any,
        });
      });

    const nodesIn = new Set(nodes.map((n) => n.id));

    // 时间线只保留演进边（主叙事），弱关系不画
    let edgesToDraw = edgesRaw;
    if (isTimeline) {
      edgesToDraw = edgesRaw.filter((e) => e.type === "evolved");
    }

    const edges = edgesToDraw
      .filter((e) => nodesIn.has(e.source) && nodesIn.has(e.target))
      .map((e) => {
        const s = EDGE_STYLE[e.type] || EDGE_STYLE.related;
        const onPath = !near || (near.has(e.source) && near.has(e.target));
        const srcDom = graph.nodes.find((n) => n.id === e.source)?.domain;
        const tgtDom = graph.nodes.find((n) => n.id === e.target)?.domain;
        const cross = srcDom !== tgtDom;
        return {
          source: e.source,
          target: e.target,
          data: { type: e.type, label: e.label },
          style: {
            stroke: isTimeline ? "#3b82f6" : s.stroke,
            lineWidth: (selectedId ? s.width * 1.15 : s.width) * (cross ? 0.75 : 1),
            strokeOpacity: onPath ? s.alpha * (cross ? 0.5 : 1) : 0.06,
            endArrow:
              e.type === "evolved" || e.type === "prereq"
                ? { type: "triangle" as const, size: 5, fill: isTimeline ? "#3b82f6" : s.stroke }
                : undefined,
            lineDash: s.dash,
          } as any,
        };
      });

    g.setData({ nodes, edges });

    // 仅知识域布局需要 preset；时间线靠固定坐标，无自动布局
    try {
      g.setLayout({ type: "preset" } as any);
    } catch { /* 布局切换失败不影响渲染 */ }
    g.draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, progress, selectedId, layoutMode, domainFilter, taskFilter, showWeakEdges, focusMode]);

  // ── 小地图开关 ───────────────────────────────
  useEffect(() => {
    const g = graphRef.current as any;
    if (!g) return;
    try {
      const minimapOpts = {
        key: "kg-minimap",
        type: "minimap",
        size: [180, 112],
        position: "right-top",
        className: "kg-minimap",
        containerStyle: {
          background: "rgba(26,32,41,0.92)",
          border: "1px solid #2a323d",
          borderRadius: "10px",
          overflow: "hidden",
          boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
        },
        maskStyle: { fill: "rgba(59,130,246,0.18)", stroke: "#3b82f6", lineWidth: 1 },
      };
      g.setPlugins(showMinimap ? [minimapOpts] : []);
    } catch { /* ignore */ }
  }, [showMinimap, graph]);

  const zoomTo = (z: number) => {
    const g = graphRef.current as any;
    if (!g) return;
    const cur = g.getZoom?.() ?? 1;
    try { g.zoomTo(Math.max(0.2, Math.min(3, cur * z))); } catch { /* ignore */ }
  };
  const fitView = () => {
    try { (graphRef.current as any)?.fitView?.(); } catch { /* ignore */ }
  };
  const focusSelected = () => {
    const g = graphRef.current as any;
    if (!g || !selectedId) return;
    try {
      const d = g.getNodeData?.(selectedId);
      const x = d?.style?.x ?? d?.data?.x;
      const y = d?.style?.y ?? d?.data?.y;
      if (x != null && y != null) {
        g.zoomTo(1.25);
        g.translateTo?.({ x, y });
      }
    } catch { /* ignore */ }
  };

  return (
    <>
      <div id="graph-container" ref={containerRef} />
      <div className="canvas-controls">
        <button onClick={() => zoomTo(1.25)} title="放大">＋</button>
        <button onClick={() => zoomTo(0.8)} title="缩小">－</button>
        <button onClick={fitView} title="适配全图">适应</button>
        <button onClick={focusSelected} title="定位选中节点" disabled={!selectedId}>◎</button>
      </div>
      <div className="canvas-legend">
        <div className="legend-title">关系</div>
        {Object.entries(EDGE_STYLE).filter(([k]) => showWeakEdges || STRONG_EDGE_TYPES.has(k)).map(([k, v]) => (
          <div className="legend-row" key={k}>
            <span className="legend-line" style={{
              background: v.dash ? `repeating-linear-gradient(90deg, ${v.stroke} 0 4px, transparent 4px 7px)` : v.stroke,
              height: v.width + 1,
            }} />
            {v.label}
          </div>
        ))}
        <div className="legend-title" style={{ marginTop: 8 }}>节点状态</div>
        <div className="legend-row"><span className="legend-dot" style={{ borderColor: "#22c55e" }} />已掌握</div>
        <div className="legend-row"><span className="legend-dot" style={{ borderColor: "#f59e0b" }} />在学</div>
        <div className="legend-row"><span className="legend-dot" style={{ borderColor: "#4b5563" }} />未学</div>
      </div>
    </>
  );
}

```

---

## 附：运行命令

```powershell
# 后端
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 前端
cd frontend
npm install
npm run dev
# 打开 http://127.0.0.1:5173/
```

