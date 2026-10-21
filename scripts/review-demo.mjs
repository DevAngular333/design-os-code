#!/usr/bin/env node
/**
 * Rebuild the public Review Pack artifact from the labeled CRM revisions.
 * The source revisions and generated report live in a temporary directory;
 * only the two checked-in docs artifacts are updated.
 */
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(new URL("..", import.meta.url).pathname);
const temp = await mkdtemp(path.join(os.tmpdir(), "code2flow-review-demo-"));
const before = path.join(temp, "crm-v1");
const after = path.join(temp, "crm-v2");
const output = path.join(temp, "review-pack");
const cli = ["run", "cli", "--"];

try {
  await cp(path.join(root, "fixtures/review-pack/crm-v1"), before, { recursive: true });
  await cp(path.join(root, "fixtures/review-pack/crm-v2"), after, { recursive: true });

  await run("npm", [...cli, "scan", before], { cwd: root });
  await run("npm", [...cli, "scan", after], { cwd: root });
  await run("npm", [
    ...cli,
    "review",
    after,
    "--from",
    path.join(before, ".code2flow", "graph.json"),
    "--focus",
    "order,status",
    "--before-label",
    "CRM v1 · synthetic",
    "--after-label",
    "CRM v2 · synthetic",
    "--before-ref",
    "fixtures/review-pack/crm-v1",
    "--after-ref",
    "fixtures/review-pack/crm-v2",
    "--product",
    "Northwind CRM (synthetic)",
    "--out",
    output,
  ], { cwd: root });

  const pack = JSON.parse(await readFile(path.join(output, "review-pack.json"), "utf8"));
  const orderItem = pack.items.find((item) => item.label.includes("/orders-status"));
  const settingsItem = pack.items.find((item) => item.label.includes("/settings-profile"));
  if (!orderItem || orderItem.relation !== "related") throw new Error("order-status change was not classified as related");
  if (!settingsItem || settingsItem.relation !== "unrelated") throw new Error("profile-settings change was not classified as unrelated");
  if (!pack.items.length || !pack.context.unchangedScreens.length) throw new Error("review pack is missing changed or unchanged evidence");

  await cp(path.join(output, "review-pack.html"), path.join(root, "docs/review-pack-demo.html"));
  await cp(path.join(output, "review-pack.json"), path.join(root, "docs/review-pack-demo.json"));
  console.log(JSON.stringify({
    status: "PASS",
    changedItems: pack.items.length,
    unchangedScreens: pack.context.unchangedScreens.length,
    relatedOrderStatus: orderItem.relation,
    unrelatedProfileSettings: settingsItem.relation,
    html: "docs/review-pack-demo.html",
    json: "docs/review-pack-demo.json",
  }));
} finally {
  await rm(temp, { recursive: true, force: true });
}
