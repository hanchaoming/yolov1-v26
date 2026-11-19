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
