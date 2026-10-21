import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { CanonicalFlowGraph } from "../schema/index.js";
import { buildReviewPack } from "../review/review-pack.js";
import { renderReviewPackHtml } from "../review/review-pack-html.js";

function graphPath(input: string): string {
  const resolved = resolve(input);
  const candidate = join(resolved, ".code2flow", "graph.json");
  return existsSync(candidate) ? candidate : resolved;
}

function readGraph(input: string): CanonicalFlowGraph {
  const file = graphPath(input);
  if (!existsSync(file)) throw new Error(`${file} not found; pass a graph.json or a scanned repo`);
  return JSON.parse(readFileSync(file, "utf8")) as CanonicalFlowGraph;
}

/** `code2flow review <repo> --from <graph.json|repo> [--focus term,term]`: create an offline review checklist. */
export async function reviewCommand(repoArg: string, flags: Record<string, string | true>, log: (line: string) => void = console.log): Promise<string[]> {
  if (typeof flags.from !== "string") throw new Error("pass --from <previous graph.json or repo path>");
  const after = readGraph(repoArg); const before = readGraph(flags.from);
  const terms = typeof flags.focus === "string" ? flags.focus.split(/[\s,]+/).filter(Boolean) : [];
  const outDir = typeof flags.out === "string" ? resolve(flags.out) : join(resolve(repoArg), ".code2flow", "review");
  const pack = buildReviewPack(before, after, {
    product: typeof flags.product === "string" ? flags.product : basename(resolve(repoArg)),
    before: { label: typeof flags["before-label"] === "string" ? flags["before-label"] : "before graph", ref: typeof flags["before-ref"] === "string" ? flags["before-ref"] : flags.from },
    after: { label: typeof flags["after-label"] === "string" ? flags["after-label"] : "after graph", ref: typeof flags["after-ref"] === "string" ? flags["after-ref"] : repoArg },
    focusTerms: terms,
  });
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, "review-pack.json"); const htmlPath = join(outDir, "review-pack.html");
  writeFileSync(jsonPath, JSON.stringify(pack, null, 2) + "\n"); writeFileSync(htmlPath, renderReviewPackHtml(pack));
  log(`review  ${pack.items.length} changed item(s), ${pack.context.unchangedScreens.length} unchanged screen(s), ${pack.context.unchangedEdges.length} unchanged edge(s)`);
  log(`review  ${htmlPath}`); log(`review  ${jsonPath}`);
  return [htmlPath, jsonPath];
}
