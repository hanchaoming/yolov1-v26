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
