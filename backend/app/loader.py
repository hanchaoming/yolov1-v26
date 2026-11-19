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
