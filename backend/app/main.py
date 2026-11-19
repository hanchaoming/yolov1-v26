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
