import { describe, expect, it } from "vitest";
import { buildReviewPack } from "../src/review/review-pack.js";
import { renderReviewPackHtml } from "../src/review/review-pack-html.js";
import type { CanonicalFlowGraph } from "../src/schema/index.js";

const graph = (screens: string[], edges: { source: string; target: string; trigger: string; file: string }[]): CanonicalFlowGraph => ({
  version: 1, framework: "static-html", rootDir: "/tmp/sample", counters: {},
  screens: screens.map((id) => ({ id, kind: "route", filePath: `${id === "/" ? "index" : id.slice(1)}.html` })),
  edges: edges.map((edge, i) => ({ id: `e${i}`, source: edge.source, target: edge.target, trigger: edge.trigger, confidence: "high", pattern: "a-href", evidence: { file: edge.file, line: i + 1 }, scope: "screen", resolved: true })),
});

describe("Review Pack", () => {
  it("classifies changed focus paths and keeps unchanged settings context separate", () => {
    const before = graph(["/", "/customers", "/settings"], [{ source: "/", target: "/customers", trigger: "Link: Customers", file: "index.html" }]);
    const after = graph(["/", "/customers", "/settings", "/orders"], [{ source: "/", target: "/customers", trigger: "Link: Customers", file: "index.html" }, { source: "/customers", target: "/orders", trigger: "Link: Orders", file: "customers.html" }]);
    const pack = buildReviewPack(before, after, { product: "crm", before: { label: "v1", ref: "before" }, after: { label: "v2", ref: "after" }, focusTerms: ["order", "status"] });
    expect(pack.items.some((item) => item.label.includes("/orders") && item.relation === "related")).toBe(true);
    expect(pack.context.unchangedScreens.some((item) => item.label.includes("/settings"))).toBe(true);
    expect(pack.items.every((item) => item.status === "todo" && item.note === "")).toBe(true);
  });

  it("renders a self-contained interactive export with status, notes and JSON download", () => {
    const pack = buildReviewPack(graph(["/"], []), graph(["/", "/orders"], [{ source: "/", target: "/orders", trigger: "Link: Orders", file: "index.html" }]), { product: "crm", before: { label: "v1", ref: "before" }, after: { label: "v2", ref: "after" }, focusTerms: ["orders"] });
    const html = renderReviewPackHtml(pack);
    expect(html).toContain("Export review JSON");
    expect(html).toContain("data-field=\"status\"");
    expect(html).toContain("data-field=\"note\"");
    expect(html).toContain("__CODE2FLOW_REVIEW");
    expect(html).toContain("id=\"review-data\"");
    expect(html).toContain("localStorage");
  });

  it("keeps a fresh seed authoritative while restoring matching reviewer fields", () => {
    const before = graph(["/"], []);
    const first = buildReviewPack(before, graph(["/", "/orders"], [{ source: "/", target: "/orders", trigger: "Link: Orders", file: "orders.html" }]), { product: "crm", before: { label: "v1", ref: "before" }, after: { label: "v2", ref: "after" }, focusTerms: ["orders"] });
    const second = buildReviewPack(before, graph(["/", "/orders", "/profile"], [
      { source: "/", target: "/orders", trigger: "Link: Orders", file: "orders.html" },
      { source: "/", target: "/profile", trigger: "Link: Profile", file: "profile.html" },
    ]), { product: "crm", before: { label: "v1", ref: "before" }, after: { label: "v3", ref: "after" }, focusTerms: ["orders"] });
    const html = renderReviewPackHtml(second);
    expect(html).toContain("savedByFingerprint");
    expect(second.items.some((item) => item.label.includes("/profile"))).toBe(true);
    expect(first.items[0].id).not.toBe(second.items.find((item) => item.label.includes("/profile"))?.id);
  });
});
