import type { GraphData, NodeDetail, ProgressMap, Stats } from "./types";

const BASE = "/api";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(BASE + url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

export const api = {
  graph: () => get<GraphData>("/graph"),
  node: (id: string) => get<NodeDetail>(`/node/${encodeURIComponent(id)}`),
  search: (q: string) =>
    get<{ results: { id: string; label: string; domain: string; summary: string }[] }>(
      `/search?q=${encodeURIComponent(q)}`
    ),
  progress: () => get<ProgressMap>("/progress"),
  setProgress: async (id: string, status: string) => {
    const res = await fetch(`${BASE}/progress/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error("progress update failed");
    return res.json();
  },
  stats: () => get<Stats>("/stats"),
};
