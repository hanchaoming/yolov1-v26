export interface Domain {
  id: string;
  label: string;
  color: string;
  description: string;
}

export interface GraphNode {
  id: string;
  label: string;
  domain: string;
  type: string;
  year?: number;
  tasks: string[];
  tags: string[];
  difficulty: number;
  summary: string;
  order: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  label: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  domains: Domain[];
}

export interface RelatedItem {
  id: string;
  label: string;
  type: string;
  label_zh: string;
}

export interface NodeDetail extends GraphNode {
  content: string;
  content_file: string;
  related: {
    prereq: RelatedItem[];
    next: RelatedItem[];
    related: RelatedItem[];
  };
}

export type ProgressMap = Record<string, "unlearned" | "learning" | "learned">;

export interface Stats {
  total: number;
  learned: number;
  learning: number;
  percent: number;
  domains: Record<
    string,
    { label: string; total: number; learned: number; learning: number; unlearned: number }
  >;
}
