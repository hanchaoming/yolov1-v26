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
