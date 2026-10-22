import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildReviewPack } from "../src/review/review-pack.js";
import { renderReviewPackHtml } from "../src/review/review-pack-html.js";
import { launchBrowser, resolvePlaywright } from "../src/snapshot/playwright-runtime.js";
import { BROWSER_HOOK_MS, closeBrowser } from "./helpers/close-browser.js";
import type { CanonicalFlowGraph } from "../src/schema/index.js";

const graph = (screens: string[], edges: { source: string; target: string; trigger: string; file: string }[]): CanonicalFlowGraph => ({
  version: 1, framework: "static-html", rootDir: "/tmp/sample", counters: {},
  screens: screens.map((id) => ({ id, kind: "route", filePath: `${id.slice(1) || "index"}.html` })),
  edges: edges.map((edge, i) => ({ id: `e${i}`, source: edge.source, target: edge.target, trigger: edge.trigger, confidence: "high", pattern: "a-href", evidence: { file: edge.file, line: i + 1 }, scope: "screen", resolved: true })),
});

let server: Server;
let url = "";
let response = "";
let browser: Awaited<ReturnType<typeof launchBrowser>>;

beforeAll(async () => {
  server = createServer((_req, res) => { res.setHeader("content-type", "text/html"); res.end(response); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  browser = await launchBrowser(resolvePlaywright(process.cwd()), true);
}, 60000);

afterAll(async () => { await closeBrowser(browser); server?.close(); }, BROWSER_HOOK_MS);

describe("Review Pack seed migration", () => {
  it("keeps saved review fields only for matching evidence and keeps new items", async () => {
    const before = graph(["/"], []);
    const first = buildReviewPack(before, graph(["/", "/orders"], [{ source: "/", target: "/orders", trigger: "Orders", file: "orders.html" }]), {
      product: "crm", before: { label: "v1", ref: "same-before" }, after: { label: "v2", ref: "same-after" }, focusTerms: ["orders"], createdAt: "2026-01-01T00:00:00.000Z",
    });
    const second = buildReviewPack(before, graph(["/", "/orders", "/profile"], [
      { source: "/", target: "/orders", trigger: "Orders", file: "orders.html" },
      { source: "/", target: "/profile", trigger: "Profile", file: "profile.html" },
    ]), {
      product: "crm", before: { label: "v1", ref: "same-before" }, after: { label: "v2", ref: "same-after" }, focusTerms: ["orders"], createdAt: "2026-01-02T00:00:00.000Z",
    });
    response = renderReviewPackHtml(first);
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const page = await context.newPage();
    await page.goto(url, {});
    await page.evaluate(`(() => { const key = "code2flow-review:crm:same-before:same-after"; const saved = JSON.parse(localStorage.getItem(key) || "null") || {}; const item = window.__CODE2FLOW_REVIEW.items[0]; saved.items = [{ ...item, status: "verified", note: "Checked old evidence" }]; localStorage.setItem(key, JSON.stringify(saved)); })()`);
    response = renderReviewPackHtml(second);
    await page.goto(url, {});
    const state = await page.evaluate<{ count: number; firstStatus: string; firstNote: string; newStatus: string; newNote: string }>(`(() => { const rows = [...document.querySelectorAll('[data-review-id]')]; const first = rows[0]; const fresh = document.querySelector('[data-review-id="screen:added:/profile"]'); return { count: rows.length, firstStatus: first?.querySelector('select')?.value || '', firstNote: first?.querySelector('textarea')?.value || '', newStatus: fresh?.querySelector('select')?.value || '', newNote: fresh?.querySelector('textarea')?.value || '' }; })()`);
    expect(state).toEqual({ count: 4, firstStatus: "verified", firstNote: "Checked old evidence", newStatus: "todo", newNote: "" });
    await page.close(); await context.close();
  });
});
