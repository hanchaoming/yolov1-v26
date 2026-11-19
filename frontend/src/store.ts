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
    return v >= 210 && v <= 640 ? v : fallback;
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
    const v = Math.max(210, Math.min(420, Math.round(w)));
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
