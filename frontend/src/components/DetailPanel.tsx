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
