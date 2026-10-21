import type { ActionEdge, CanonicalFlowGraph, SourceEvidence } from "../schema/index.js";

export type ReviewStatus = "todo" | "in-review" | "verified";
export type ReviewRelation = "related" | "unrelated" | "unknown";
export type ReviewItemKind = "screen" | "edge" | "confidence" | "counter";
export type ReviewChange = "added" | "removed" | "changed";

export interface ReviewSource { label: string; ref: string }
export interface ReviewSourceEvidence { file: string; line?: number; snippet?: string }
export interface ReviewEvidence { before?: ReviewSourceEvidence; after?: ReviewSourceEvidence }
export interface ReviewItem {
  id: string;
  kind: ReviewItemKind;
  change: ReviewChange;
  label: string;
  relation: ReviewRelation;
  rationale: string;
  status: ReviewStatus;
  note: string;
  evidence: ReviewEvidence;
  sourceRefs: string[];
}
export interface ReviewContextItem { id: string; kind: "screen" | "edge"; label: string; relation: "unchanged"; sourceRefs: string[] }
export interface ReviewPack {
  version: 1;
  product: string;
  createdAt: string;
  source: { before: ReviewSource; after: ReviewSource };
  focusTerms: string[];
  items: ReviewItem[];
  context: { unchangedScreens: ReviewContextItem[]; unchangedEdges: ReviewContextItem[] };
  limitations: string[];
}

const edgeKey = (edge: ActionEdge): string => `${edge.scope}|${edge.source} -> ${edge.target}|${edge.trigger}`;
const edgeLabel = (edge: ActionEdge): string => `${edge.source} → ${edge.target} · ${edge.trigger}`;
const evidenceRefs = (evidence?: SourceEvidence): string[] => evidence ? [`${evidence.file}${evidence.line ? `:${evidence.line}` : ""}`] : [];
const screenEvidence = (graph: CanonicalFlowGraph, id: string): ReviewSourceEvidence | undefined => {
  const screen = graph.screens.find((candidate) => candidate.id === id);
  return screen ? { file: screen.filePath } : undefined;
};
const screenRefs = (filePath: string): string[] => filePath ? [filePath] : [];

function normalizeTerms(terms: string[]): string[] {
  return [...new Set(terms.flatMap((term) => term.split(/[\s,]+/).map((part) => part.trim().toLowerCase()).filter(Boolean)))];
}

function relationFor(haystack: string, terms: string[]): { relation: ReviewRelation; rationale: string } {
  if (!terms.length) return { relation: "unknown", rationale: "No focus term was supplied; reviewer classification is required." };
  const lower = haystack.toLowerCase();
  const matched = terms.filter((term) => lower.includes(term));
  return matched.length
    ? { relation: "related", rationale: `Matched focus term${matched.length > 1 ? "s" : ""}: ${matched.join(", ")}.` }
    : { relation: "unrelated", rationale: "No supplied focus term appears in the changed label or source reference." };
}

function item(input: Omit<ReviewItem, "relation" | "rationale" | "status" | "note">, terms: string[], search: string): ReviewItem {
  return { ...input, ...relationFor(search, terms), status: "todo", note: "" };
}

function contextEdge(edge: ActionEdge): ReviewContextItem {
  return { id: `edge:${edgeKey(edge)}`, kind: "edge", label: `Unchanged transition: ${edgeLabel(edge)}`, relation: "unchanged", sourceRefs: evidenceRefs(edge.evidence) };
}

/** Build a deterministic reviewer-owned pack from two parser graphs. It does not infer runtime impact. */
export function buildReviewPack(before: CanonicalFlowGraph, after: CanonicalFlowGraph, options: {
  product: string;
  before: ReviewSource;
  after: ReviewSource;
  focusTerms?: string[];
  createdAt?: string;
}): ReviewPack {
  const terms = normalizeTerms(options.focusTerms ?? []);
  const beforeScreens = new Map(before.screens.map((screen) => [screen.id, screen]));
  const afterScreens = new Map(after.screens.map((screen) => [screen.id, screen]));
  const beforeEdges = new Map(before.edges.map((edge) => [edgeKey(edge), edge]));
  const afterEdges = new Map(after.edges.map((edge) => [edgeKey(edge), edge]));
  const items: ReviewItem[] = [];

  for (const id of [...afterScreens.keys()].filter((key) => !beforeScreens.has(key)).sort()) {
    const screen = afterScreens.get(id)!;
    items.push(item({ id: `screen:added:${id}`, kind: "screen", change: "added", label: `Screen added: ${id}`, evidence: { after: screenEvidence(after, id) }, sourceRefs: screenRefs(screen.filePath) }, terms, `${id} ${screen.filePath}`));
  }
  for (const id of [...beforeScreens.keys()].filter((key) => !afterScreens.has(key)).sort()) {
    const screen = beforeScreens.get(id)!;
    items.push(item({ id: `screen:removed:${id}`, kind: "screen", change: "removed", label: `Screen removed: ${id}`, evidence: { before: screenEvidence(before, id) }, sourceRefs: screenRefs(screen.filePath) }, terms, `${id} ${screen.filePath}`));
  }
  for (const key of [...afterEdges.keys()].filter((candidate) => !beforeEdges.has(candidate)).sort()) {
    const edge = afterEdges.get(key)!;
    items.push(item({ id: `edge:added:${key}`, kind: "edge", change: "added", label: `Transition added: ${edgeLabel(edge)}`, evidence: { after: edge.evidence }, sourceRefs: evidenceRefs(edge.evidence) }, terms, `${edgeLabel(edge)} ${edge.evidence.file}`));
  }
  for (const key of [...beforeEdges.keys()].filter((candidate) => !afterEdges.has(candidate)).sort()) {
    const edge = beforeEdges.get(key)!;
    items.push(item({ id: `edge:removed:${key}`, kind: "edge", change: "removed", label: `Transition removed: ${edgeLabel(edge)}`, evidence: { before: edge.evidence }, sourceRefs: evidenceRefs(edge.evidence) }, terms, `${edgeLabel(edge)} ${edge.evidence.file}`));
  }
  for (const key of [...afterEdges.keys()].filter((candidate) => beforeEdges.has(candidate)).sort()) {
    const next = afterEdges.get(key)!; const previous = beforeEdges.get(key)!;
    if (next.confidence === previous.confidence) continue;
    items.push(item({ id: `confidence:${key}`, kind: "confidence", change: "changed", label: `Confidence changed: ${edgeLabel(next)} (${previous.confidence} → ${next.confidence})`, evidence: { before: previous.evidence, after: next.evidence }, sourceRefs: [...new Set([...evidenceRefs(previous.evidence), ...evidenceRefs(next.evidence)])] }, terms, `${edgeLabel(next)} ${previous.evidence.file} ${next.evidence.file}`));
  }
  const counterFiles = new Set([...Object.keys(before.counters), ...Object.keys(after.counters)]);
  for (const file of [...counterFiles].sort()) {
    const names = new Set([...Object.keys(before.counters[file] ?? {}), ...Object.keys(after.counters[file] ?? {})]);
    for (const name of [...names].sort()) {
      const oldValue = before.counters[file]?.[name] ?? 0; const newValue = after.counters[file]?.[name] ?? 0;
      if (oldValue === newValue) continue;
      items.push(item({ id: `counter:${file}:${name}`, kind: "counter", change: "changed", label: `Counter changed: ${file} · ${name} (${oldValue} → ${newValue})`, evidence: { before: { file }, after: { file } }, sourceRefs: [file] }, terms, `${file} ${name}`));
    }
  }
  const unchangedScreens = [...afterScreens.keys()].filter((id) => beforeScreens.has(id)).sort().map((id) => ({ id: `screen:${id}`, kind: "screen" as const, label: `Unchanged screen: ${id}`, relation: "unchanged" as const, sourceRefs: [...new Set([beforeScreens.get(id)!.filePath, afterScreens.get(id)!.filePath])] }));
  const unchangedEdges = [...afterEdges.keys()].filter((key) => beforeEdges.has(key)).sort().map((key) => contextEdge(afterEdges.get(key)!));
  return {
    version: 1, product: options.product, createdAt: options.createdAt ?? new Date().toISOString(),
    source: { before: options.before, after: options.after }, focusTerms: terms, items,
    context: { unchangedScreens, unchangedEdges },
    limitations: [
      "Impact relation is a deterministic focus-term match over graph labels and source paths; it is not an AI judgment.",
      "A changed graph edge proves a parser-visible relationship, not that the product behavior is correct.",
      "Browser capture and runtime semantics require a separately running target app; this pack does not analyze GitHub online.",
    ],
  };
}

export { edgeKey };
