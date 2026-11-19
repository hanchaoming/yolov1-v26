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
