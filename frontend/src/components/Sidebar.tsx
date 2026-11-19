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
        <span className="label">全部</span>
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
              <span className="label">{d.label}</span>
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
