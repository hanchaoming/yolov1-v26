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
  const [dragging, setDragging] = useState<"side" | "detail" | null>(null);

  const onResizeStart = (kind: "side" | "detail") => (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = {
      kind,
      x: e.clientX,
      w: kind === "side" ? sidebarWidth : detailWidth,
    };
    setDragging(kind);
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const delta = ev.clientX - d.x;
      if (d.kind === "side") setSidebarWidth(d.w + delta);
      else setDetailWidth(d.w - delta);
    };
    const onUp = () => {
      dragRef.current = null;
      setDragging(null);
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
        <div className={`side-wrap ${dragging === "side" ? "dragging" : ""}`} style={{ width: sidebarWidth }}>
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
            <div className={`detail-wrap ${dragging === "detail" ? "dragging" : ""}`} style={{ width: detailWidth }}>
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
