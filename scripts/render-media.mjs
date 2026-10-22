#!/usr/bin/env node
/**
 * Reproducible media renderer for the DevAngular333 visual launch.
 *
 * The capture step opens the checked out Review Pack and its synthetic sample
 * app with Playwright. The renderer then composes those captured screens with
 * an original graph animation in a fixed browser stage before encoding with
 * ffmpeg. Raw captures stay outside public repositories.
 */
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const here = resolve(fileURLToPath(new URL(".", import.meta.url)));
const defaultProductRoot = resolve(here, "..");
const defaultOutput = resolve(defaultProductRoot, ".media-output");
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  if (key.startsWith("--")) args.set(key.slice(2), process.argv[i + 1]?.startsWith("--") ? true : process.argv[++i] ?? true);
}
const productRoot = resolve(String(args.get("product-root") || defaultProductRoot));
const outputRoot = resolve(String(args.get("out") || defaultOutput));
const rawRoot = join(outputRoot, "raw");
const assetRoot = join(outputRoot, "assets");
const distRoot = join(outputRoot, "dist");
const framesRoot = join(outputRoot, ".frames");
const playrightEntry = pathToFileURL(join(productRoot, "node_modules/playwright/index.mjs")).href;

const ensure = (...dirs) => Promise.all(dirs.map((dir) => mkdir(dir, { recursive: true })));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

async function serve(root) {
  const base = resolve(root);
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent((request.url || "/").split("?")[0]);
      const candidate = resolve(join(base, pathname === "/" ? "index.html" : pathname.slice(1)));
      if (!candidate.startsWith(`${base}/`) && candidate !== base) {
        response.writeHead(403); response.end("forbidden"); return;
      }
      const data = await readFile(candidate);
      response.writeHead(200, { "content-type": mime[extname(candidate)] || "application/octet-stream", "cache-control": "no-store" });
      response.end(data);
    } catch {
      response.writeHead(404); response.end("not found");
    }
  });
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}` };
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[character]));
}

function graphSvg(progress = 1, light = false) {
  const bg = light ? "#F4F7FB" : "#0B1020";
  const ink = light ? "#13233A" : "#F4F7FB";
  const muted = light ? "#53657E" : "#9FB0C8";
  const before = "#6EE7F9";
  const after = "#C7F36B";
  const changed = "#FF8A65";
  const nodes = [
    [180, 210, "Dashboard", "before"], [500, 145, "Customers", "before"], [840, 210, "Orders", "before"],
    [1180, 145, "Order status", "after"], [1480, 270, "Profile settings", "after"], [1080, 450, "Reviewer", "after"],
  ];
  const edges = [
    [180, 210, 500, 145, before, 0.2], [500, 145, 840, 210, before, 0.35],
    [500, 145, 1180, 145, changed, 0.5], [1180, 145, 1080, 450, after, 0.68],
    [1180, 145, 1480, 270, after, 0.82], [840, 210, 1080, 450, changed, 0.92],
  ];
  const visible = (threshold) => Math.max(0, Math.min(1, (progress - threshold) / 0.16));
  const line = edges.map(([x1, y1, x2, y2, color, threshold]) => {
    const opacity = visible(threshold);
    return `<line x1="${x1}" y1="${y1}" x2="${x1 + (x2 - x1) * opacity}" y2="${y1 + (y2 - y1) * opacity}" stroke="${color}" stroke-width="7" stroke-linecap="round" opacity="${opacity}" />`;
  }).join("");
  const node = nodes.map(([x, y, label, kind], index) => {
    const appear = visible(0.03 + index * 0.12);
    const color = kind === "before" ? before : after;
    return `<g opacity="${appear}" transform="translate(${x} ${y}) scale(${0.84 + appear * 0.16})"><circle r="44" fill="${color}" fill-opacity=".16" stroke="${color}" stroke-width="4"/><circle r="10" fill="${color}"/><text y="76" text-anchor="middle" fill="${ink}" font-family="Arial,Helvetica,sans-serif" font-size="25" font-weight="700">${escapeXml(label)}</text><text y="105" text-anchor="middle" fill="${muted}" font-family="Menlo,monospace" font-size="15">${kind === "before" ? "v1 evidence" : "v2 change"}</text></g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1680 620" width="1680" height="620"><rect width="1680" height="620" rx="24" fill="${bg}"/>${line}${node}<text x="66" y="68" fill="${muted}" font-family="Menlo,monospace" font-size="19" letter-spacing="4">GRAPH DELTA / REVIEW SIGNAL</text><text x="66" y="108" fill="${ink}" font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="700">before → after → evidence</text></svg>`;
}

function heroSvg(theme) {
  const light = theme === "light";
  const bg = light ? "#F4F7FB" : "#0B1020";
  const panel = light ? "#FFFFFF" : "#101A2B";
  const ink = light ? "#13233A" : "#F4F7FB";
  const muted = light ? "#53657E" : "#9FB0C8";
  const accent = light ? "#007C91" : "#6EE7F9";
  const evidence = light ? "#6E8F00" : "#C7F36B";
  const route = Array.from({ length: 9 }, (_, index) => {
    const x = 850 + index * 52;
    const y = 166 + Math.sin(index * 0.9) * 76;
    return `<circle cx="${x}" cy="${y}" r="${index % 3 === 0 ? 11 : 7}" fill="${index % 2 ? evidence : accent}"/><line x1="${x - 52}" y1="${166 + Math.sin((index - 1) * 0.9) * 76}" x2="${x}" y2="${y}" stroke="${index % 2 ? evidence : accent}" stroke-width="3" opacity=".75"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640"><rect width="1280" height="640" fill="${bg}"/><rect x="42" y="42" width="1196" height="556" rx="28" fill="${panel}" stroke="${accent}" stroke-opacity=".24"/><path d="M64 510H1214" stroke="${accent}" stroke-opacity=".16" stroke-width="2"/><path d="M64 134H1214" stroke="${accent}" stroke-opacity=".16" stroke-width="2"/><g opacity=".9">${route}</g><text x="92" y="156" fill="${accent}" font-family="Menlo,monospace" font-size="22" letter-spacing="4">DEVANGULAR333 / CREATIVE ENGINEERING</text><text x="92" y="254" fill="${ink}" font-family="Arial,Helvetica,sans-serif" font-size="64" font-weight="700">AI systems with</text><text x="92" y="330" fill="${ink}" font-family="Arial,Helvetica,sans-serif" font-size="64" font-weight="700">visible evidence.</text><text x="96" y="404" fill="${muted}" font-family="Arial,Helvetica,sans-serif" font-size="25">Graph · route · revision · review</text><rect x="92" y="468" width="232" height="54" rx="27" fill="${accent}"/><text x="208" y="503" text-anchor="middle" fill="${light ? "#F4F7FB" : "#0B1020"}" font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="700">DEVANGULAR333</text><text x="1110" y="548" text-anchor="end" fill="${muted}" font-family="Menlo,monospace" font-size="16">01 / 03</text></svg>`;
}

function coverSvg(kind) {
  const common = { code2flow: ["CODE2FLOW", "REVIEW PACK", "#6EE7F9", "#C7F36B"], teacher: ["AGENT", "TEACHER", "#FF8A65", "#C7F36B"], inkos: ["INKOS ×", "PRINTFIlM LAB", "#B69CFF", "#FFCC66"] }[kind];
  const [title, subtitle, primary, secondary] = common;
  let motif = "";
  if (kind === "code2flow") motif = `<rect x="870" y="145" width="610" height="485" rx="26" fill="#101A2B" stroke="#6EE7F9" stroke-opacity=".24"/><path d="M930 290L1070 230L1210 340L1370 250L1440 465" fill="none" stroke="#6EE7F9" stroke-width="6" stroke-linecap="round"/><path d="M1070 230L1210 340L1370 250" fill="none" stroke="#FF8A65" stroke-width="6" stroke-linecap="round"/><path d="M1210 340L1280 505" fill="none" stroke="#C7F36B" stroke-width="6" stroke-linecap="round"/><g fill="#0B1020" stroke="#6EE7F9" stroke-width="4"><circle cx="930" cy="290" r="25"/><circle cx="1070" cy="230" r="25"/><circle cx="1210" cy="340" r="25"/></g><g fill="#0B1020" stroke="#C7F36B" stroke-width="4"><circle cx="1370" cy="250" r="25"/><circle cx="1280" cy="505" r="25"/><circle cx="1440" cy="465" r="25"/></g><text x="920" y="190" fill="#9FB0C8" font-family="Menlo,monospace" font-size="17" letter-spacing="3">GRAPH DELTA</text><text x="930" y="350" fill="#F4F7FB" font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="700">before</text><text x="1330" y="355" fill="#F4F7FB" font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="700">after</text><text x="930" y="585" fill="#9FB0C8" font-family="Menlo,monospace" font-size="16">nodes · edges · evidence</text>`;
  if (kind === "teacher") motif = `<path d="M1120 520C1050 420 1110 330 1015 250C940 186 875 238 808 180" fill="none" stroke="${primary}" stroke-width="12" stroke-linecap="round" stroke-dasharray="18 20"/><circle cx="1120" cy="520" r="30" fill="${secondary}"/><circle cx="808" cy="180" r="30" fill="${primary}"/><text x="855" y="155" fill="#F4F7FB" font-family="Menlo,monospace" font-size="20">rehearse → replay</text>`;
  if (kind === "inkos") motif = `<rect x="890" y="140" width="230" height="310" rx="18" fill="#B69CFF" fill-opacity=".16" stroke="#B69CFF" stroke-width="4"/><rect x="1170" y="198" width="230" height="310" rx="18" fill="#FFCC66" fill-opacity=".16" stroke="#FFCC66" stroke-width="4"/><path d="M1128 294H1160" stroke="#F4F7FB" stroke-width="9" stroke-linecap="round"/><path d="M1146 276L1164 294L1146 312" fill="none" stroke="#F4F7FB" stroke-width="7"/><text x="1005" y="208" text-anchor="middle" fill="#F4F7FB" font-family="Menlo,monospace" font-size="19">markdown</text><text x="1285" y="266" text-anchor="middle" fill="#F4F7FB" font-family="Menlo,monospace" font-size="19">shots</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#0B1020"/><path d="M0 720L1600 160" stroke="${primary}" stroke-opacity=".1" stroke-width="180"/><g>${motif}</g><text x="110" y="170" fill="${primary}" font-family="Menlo,monospace" font-size="22" letter-spacing="4">DEVANGULAR333 / PRODUCT SYSTEM</text><text x="110" y="330" fill="#F4F7FB" font-family="Arial,Helvetica,sans-serif" font-size="84" font-weight="700">${escapeXml(title)}</text><text x="110" y="424" fill="#F4F7FB" font-family="Arial,Helvetica,sans-serif" font-size="84" font-weight="700">${escapeXml(subtitle)}</text><text x="114" y="516" fill="#9FB0C8" font-family="Arial,Helvetica,sans-serif" font-size="26">Evidence-led workflows for creative engineering.</text><rect x="110" y="650" width="310" height="8" rx="4" fill="${primary}"/><rect x="430" y="650" width="170" height="8" rx="4" fill="${secondary}"/><text x="110" y="750" fill="#9FB0C8" font-family="Menlo,monospace" font-size="17">LOCAL-FIRST · PUBLIC-SAFE · RE-RUNNABLE</text></svg>`;
}

function makeSrt() {
  return `1\n00:00:00,000 --> 00:00:05,000\nReviewer cần biết: luồng nào đã đổi?\n\n2\n00:00:05,000 --> 00:00:15,000\nHai revision · CRM v1 → CRM v2 · dữ liệu synthetic\n\n3\n00:00:15,000 --> 00:00:28,000\nRelated / unrelated · source evidence · focus: order, status\n\n4\n00:00:28,000 --> 00:00:43,000\nMở flow thật · ghi chú · đổi trạng thái\n\n5\n00:00:43,000 --> 00:00:52,000\nExport review JSON · giữ note và status\n\n6\n00:00:52,000 --> 00:00:58,000\nCode2Flow Review Pack · DevAngular333 · Try demo\n`;
}

function makeVerticalSrt() {
  return `1\n00:00:00,000 --> 00:00:03,500\nCode2Flow Review Pack\n\n2\n00:00:03,500 --> 00:00:10,000\nHai graph revision · tìm đúng luồng đổi\n\n3\n00:00:10,000 --> 00:00:19,000\nMở evidence · kiểm tra status · ghi chú\n\n4\n00:00:19,000 --> 00:00:25,000\nExport JSON · dữ liệu synthetic\n\n5\n00:00:25,000 --> 00:00:30,000\nTry demo · DevAngular333\n`;
}

async function writeBrandAssets(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const specs = [
    ["profile-hero-dark", heroSvg("dark"), 1280, 640],
    ["profile-hero-light", heroSvg("light"), 1280, 640],
    ["code2flow-review-pack-cover", coverSvg("code2flow"), 1600, 900],
    ["agent-teacher-cover", coverSvg("teacher"), 1600, 900],
    ["inkos-bridge-cover", coverSvg("inkos"), 1600, 900],
  ];
  for (const [name, svg, width, height] of specs) {
    await writeFile(join(assetRoot, `${name}.svg`), svg);
    await page.setViewportSize({ width, height });
    await page.setContent(svg);
    await page.screenshot({ path: join(assetRoot, `${name}.png`), type: "png" });
  }
  await page.close();
}

async function captureFootage(browser, reportUrl, appUrl, metadata) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const shots = {};
  const shot = async (name, fullPage = false) => {
    const path = join(rawRoot, `${name}.png`);
    await page.screenshot({ path, fullPage });
    shots[name] = relative(outputRoot, path);
  };
  await page.goto(reportUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await shot("report-initial");
  const firstStatus = page.locator("select[data-field=status]").first();
  await firstStatus.selectOption("verified");
  await page.locator("textarea[data-field=note]").first().fill("Checked the running CRM path");
  await shot("report-reviewed");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export").click();
  const download = await downloadPromise;
  const exportPath = join(rawRoot, "exported-review.json");
  await download.saveAs(exportPath);
  shots.exportedReview = relative(outputRoot, exportPath);
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await shot("app-dashboard");
  await page.getByRole("link", { name: "Customers" }).first().click();
  await page.waitForLoadState("networkidle");
  await shot("app-customers");
  await page.getByRole("link", { name: "Review order status" }).click();
  await page.waitForLoadState("networkidle");
  await shot("app-status");
  await page.getByRole("button", { name: "Mark status reviewed" }).click();
  await shot("app-confirmed");
  await page.setViewportSize({ width: 900, height: 1200 });
  await shot("app-confirmed-vertical");
  await page.close();
  const exported = JSON.parse(await readFile(exportPath, "utf8"));
  if (exported.items?.[0]?.status !== "verified" || exported.items?.[0]?.note !== "Checked the running CRM path") {
    throw new Error("capture did not preserve the verified status and reviewer note");
  }
  await writeFile(join(rawRoot, "capture-metadata.json"), JSON.stringify({ ...metadata, urls: { reportUrl, appUrl }, shots, exportedStatus: exported.items?.[0]?.status, exportedNote: exported.items?.[0]?.note }, null, 2) + "\n");
}

function dataUrl(buffer, type) {
  return `data:${type};base64,${buffer.toString("base64")}`;
}

async function stageHtml() {
  const readImage = async (name) => dataUrl(await readFile(join(rawRoot, name)), "image/png");
  const images = {
    report: await readImage("report-initial.png"),
    reviewed: await readImage("report-reviewed.png"),
    dashboard: await readImage("app-dashboard.png"),
    customers: await readImage("app-customers.png"),
    status: await readImage("app-status.png"),
    confirmed: await readImage("app-confirmed.png"),
    confirmedVertical: await readImage("app-confirmed-vertical.png"),
    cover: dataUrl(await readFile(join(assetRoot, "code2flow-review-pack-cover.png")), "image/png"),
  };
  return `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;background:#0B1020;color:#F4F7FB;font-family:Arial,Helvetica,sans-serif}#stage{position:relative;overflow:hidden;width:100vw;height:100vh;background:linear-gradient(145deg,#0B1020,#101A2B 58%,#111D22)}#brand{position:absolute;z-index:5;top:56px;left:74px;color:#6EE7F9;font:700 19px Menlo,monospace;letter-spacing:4px}#brand span{color:#9FB0C8;font-weight:400;letter-spacing:1px;font-size:13px;margin-left:18px}.scene{position:absolute;inset:150px 74px 220px;display:flex;align-items:center;justify-content:center}.scene img{max-width:100%;max-height:100%;object-fit:contain;border:1px solid #2C4058;border-radius:18px;box-shadow:0 22px 80px #0008}.caption{position:absolute;z-index:4;left:74px;right:74px;bottom:72px}.kicker{color:#C7F36B;font:700 17px Menlo,monospace;letter-spacing:3px;text-transform:uppercase}.caption h1{margin:13px 0 0;font-size:54px;line-height:1.02;letter-spacing:-2px}.caption p{margin:12px 0 0;color:#B9C6D8;font-size:22px}.footer{position:absolute;z-index:4;right:74px;bottom:42px;color:#6F8098;font:14px Menlo,monospace}.stage-vertical #brand{top:42px;left:42px;font-size:15px;letter-spacing:2px}.stage-vertical .scene{inset:150px 42px 450px}.stage-vertical .caption{left:42px;right:42px;bottom:115px}.stage-vertical .caption h1{font-size:48px}.stage-vertical .caption p{font-size:21px}.stage-vertical .footer{left:42px;right:42px;bottom:65px;font-size:13px}.graph-wrap{width:100%;height:100%;display:flex;align-items:center;justify-content:center}.graph-wrap svg{width:100%;height:auto;border-radius:18px;box-shadow:0 22px 80px #0008}.json-card{width:min(1120px,100%);padding:40px;border:1px solid #2C4058;border-radius:18px;background:#101A2B;box-shadow:0 22px 80px #0008;font:20px/1.65 Menlo,monospace}.json-card .key{color:#6EE7F9}.json-card .value{color:#C7F36B}.json-card .note{color:#FFCC66}.stamp{display:inline-block;padding:8px 12px;border:1px solid #C7F36B;color:#C7F36B;border-radius:99px;font:700 15px Menlo,monospace;letter-spacing:2px;margin-bottom:22px}</style></head><body><div id="stage"><div id="brand">DEVANGULAR333 <span>CREATIVE ENGINEERING</span></div><div class="scene" id="scene"></div><div class="caption"><div class="kicker" id="kicker"></div><h1 id="title"></h1><p id="body"></p></div><div class="footer">CODE2FLOW REVIEW PACK · v0.5.1-devangular333</div></div><script>
const images = ${JSON.stringify(images)};
const duration = Number(document.body.dataset.duration || 58);
const esc = value => String(value).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const graph = progress => ${JSON.stringify(graphSvg(0)).replace("0", "progress").replace(/\\u003c/g, "<")};
function graphMarkup(progress) {
  const bg = '#0B1020', ink='#F4F7FB', muted='#9FB0C8', before='#6EE7F9', after='#C7F36B', changed='#FF8A65';
  const nodes=[[180,210,'Dashboard','before'],[500,145,'Customers','before'],[840,210,'Orders','before'],[1180,145,'Order status','after'],[1480,270,'Profile settings','after'],[1080,450,'Reviewer','after']];
  const edges=[[180,210,500,145,before,.2],[500,145,840,210,before,.35],[500,145,1180,145,changed,.5],[1180,145,1080,450,after,.68],[1180,145,1480,270,after,.82],[840,210,1080,450,changed,.92]];
  const visible=t=>Math.max(0,Math.min(1,(progress-t)/.16));
  const lines=edges.map(([x1,y1,x2,y2,color,t])=>{const o=visible(t);return '<line x1="'+x1+'" y1="'+y1+'" x2="'+(x1+(x2-x1)*o)+'" y2="'+(y1+(y2-y1)*o)+'" stroke="'+color+'" stroke-width="7" stroke-linecap="round" opacity="'+o+'"/>'}).join('');
  const circles=nodes.map(([x,y,label,kind],i)=>{const o=visible(.03+i*.12),color=kind==='before'?before:after;return '<g opacity="'+o+'" transform="translate('+x+' '+y+') scale('+(0.84+o*.16)+')"><circle r="44" fill="'+color+'" fill-opacity=".16" stroke="'+color+'" stroke-width="4"/><circle r="10" fill="'+color+'"/><text y="76" text-anchor="middle" fill="'+ink+'" font-family="Arial,Helvetica,sans-serif" font-size="25" font-weight="700">'+label+'</text><text y="105" text-anchor="middle" fill="'+muted+'" font-family="Menlo,monospace" font-size="15">'+(kind==='before'?'v1 evidence':'v2 change')+'</text></g>'}).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1680 620" width="1680" height="620"><rect width="1680" height="620" rx="24" fill="'+bg+'"/>'+lines+circles+'<text x="66" y="68" fill="'+muted+'" font-family="Menlo,monospace" font-size="19" letter-spacing="4">GRAPH DELTA / REVIEW SIGNAL</text><text x="66" y="108" fill="'+ink+'" font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="700">before → after → evidence</text></svg>';
}
function jsonCard(){return '<div class="json-card"><span class="stamp">EXPORTED REVIEW JSON</span><div><span class="key">status</span>: <span class="value">"verified"</span></div><div><span class="key">note</span>: <span class="note">"Checked the running CRM path"</span></div><div><span class="key">relation</span>: <span class="value">"related"</span></div><div><span class="key">sourceRefs</span>: ["customers.html:2"]</div></div>'}
function setFrame(frame){const t=frame.time, vertical=frame.vertical;const stage=document.getElementById('stage');stage.className=vertical?'stage-vertical':'';const scene=document.getElementById('scene'), kicker=document.getElementById('kicker'), title=document.getElementById('title'), body=document.getElementById('body');let html='';let k='',h='',p='';if(!vertical){if(t<7){html='<div class="graph-wrap">'+graphMarkup(Math.min(1,t/6))+'</div>';k='01 / GRAPH DELTA';h='Which flow changed?';p='A reviewer starts with visible route evidence.'}else if(t<15){html='<img src="'+images.report+'" style="transform:scale('+(1.02+(t-7)*.015)+')">';k='02 / REVISION INPUT';h='CRM v1 → CRM v2';p='Two labeled revisions. Synthetic data. Local report.'}else if(t<28){html='<img src="'+images.reviewed+'">';k='03 / EVIDENCE';h='Related, unrelated, source refs';p='Focus matching narrows the checklist. A person confirms behavior.'}else if(t<34){html='<img src="'+images.dashboard+'">';k='04 / RUNNING APP';h='Open the real sample flow';p='Dashboard → Customers';}else if(t<38){html='<img src="'+images.customers+'">';k='04 / RUNNING APP';h='Follow the changed route';p='Customers → Review order status';}else if(t<43){html='<img src="'+images.confirmed+'">';k='04 / RUNNING APP';h='Mark status reviewed';p='The confirmation is visible in the running synthetic app.'}else if(t<52){html=jsonCard();k='05 / OUTPUT';h='Export a review you can use';p='Status and note stay with the evidence.'}else{html='<img src="'+images.cover+'">';k='06 / DEVANGULAR333';h='Review the change. Keep the proof.';p='Try the demo · github.com/DevAngular333/design-os-code';}}else{if(t<3.5){html='<div class="graph-wrap">'+graphMarkup(Math.min(1,t/3))+'</div>';k='GRAPH DELTA';h='Find the changed flow';p='Code2Flow Review Pack'}else if(t<10){html='<img src="'+images.reviewed+'">';k='EVIDENCE';h='Related + source refs';p='CRM v1 → CRM v2 · synthetic'}else if(t<13){html='<img src="'+images.customers+'">';k='RUNNING APP';h='Open the route';p='Customers → Order status'}else if(t<19){html='<img src="'+images.confirmedVertical+'">';k='RUNNING APP';h='Mark reviewed';p='Confirmation shown in the real sample app'}else if(t<25){html=jsonCard();k='OUTPUT';h='Export JSON';p='Verified status + reviewer note'}else{html='<img src="'+images.cover+'">';k='DEVANGULAR333';h='Try the demo';p='github.com/DevAngular333/design-os-code';}}scene.innerHTML=html;kicker.textContent=k;title.textContent=h;body.textContent=p;}
window.setFrame=setFrame;</script></body></html>`;
}

async function renderVideo(browser, html, duration, vertical, outputPath) {
  const page = await browser.newPage({ viewport: vertical ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  const frameDir = join(framesRoot, vertical ? "vertical" : "horizontal");
  await rm(frameDir, { recursive: true, force: true });
  await mkdir(frameDir, { recursive: true });
  for (let frame = 0; frame < duration * 30; frame += 1) {
    await page.evaluate(({ frameNumber, isVertical }) => window.setFrame({ time: frameNumber / 30, vertical: isVertical }), { frameNumber: frame, isVertical: vertical });
    await page.screenshot({ path: join(frameDir, `${String(frame).padStart(5, "0")}.jpg`), type: "jpeg", quality: 86 });
  }
  await page.close();
  await run("ffmpeg", ["-y", "-framerate", "30", "-i", join(frameDir, "%05d.jpg"), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-color_range", "tv", "-movflags", "+faststart", outputPath], { cwd: outputRoot });
  return frameDir;
}

async function main() {
  await ensure(rawRoot, assetRoot, distRoot, framesRoot);
  const { stdout: commit } = await run("git", ["-C", productRoot, "rev-parse", "HEAD"]);
  const { stdout: ref } = await run("git", ["-C", productRoot, "describe", "--tags", "--always", "--dirty"]);
  const metadata = { generatedAt: new Date().toISOString(), product: "Code2Flow Review Pack", productVersion: "0.5.1-devangular333", commit: commit.trim(), gitRef: ref.trim(), source: "fixtures/review-pack/crm-v1 → crm-v2; synthetic public-safe data", rights: "Original SVG/layout/motion by DevAngular333; product UI captures from the MIT-licensed DevAngular333 derivative; no external music or provider data." };
  const { chromium } = await import(playrightEntry);
  const browser = await chromium.launch({ headless: true });
  const reportServer = await serve(join(productRoot, "docs"));
  const appServer = await serve(join(productRoot, "fixtures/review-pack/crm-v2"));
  try {
    await writeBrandAssets(browser);
    await captureFootage(browser, `${reportServer.url}/review-pack-demo.html`, `${appServer.url}/`, metadata);
    const html = await stageHtml();
    await writeFile(join(outputRoot, "stage.html"), html);
    const horizontal = join(distRoot, "code2flow-review-pack-launch-1080p.mp4");
    const vertical = join(distRoot, "code2flow-review-pack-facebook-vertical.mp4");
    await renderVideo(browser, html, 58, false, horizontal);
    await renderVideo(browser, html, 30, true, vertical);
    const poster = join(distRoot, "code2flow-review-pack-poster.png");
    await run("ffmpeg", ["-y", "-ss", "54", "-i", horizontal, "-frames:v", "1", "-vf", "scale=1280:-1", poster], { cwd: outputRoot });
    const gif = join(distRoot, "code2flow-review-pack-preview.gif");
    await run("ffmpeg", ["-y", "-i", horizontal, "-t", "10", "-vf", "fps=10,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=sierra2_4a", "-loop", "0", gif], { cwd: outputRoot });
    const srt = join(distRoot, "code2flow-review-pack-vi.srt");
    const verticalSrt = join(distRoot, "code2flow-review-pack-facebook-vi.srt");
    await writeFile(srt, makeSrt());
    await writeFile(verticalSrt, makeVerticalSrt());
    const { stdout: duration } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", horizontal]);
    const { stdout: verticalDuration } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", vertical]);
    await writeFile(join(distRoot, "media-manifest.json"), JSON.stringify({ ...metadata, outputs: { horizontal: { file: relative(outputRoot, horizontal), duration: Number(duration.trim()) }, vertical: { file: relative(outputRoot, vertical), duration: Number(verticalDuration.trim()) }, gif: relative(outputRoot, gif), poster: relative(outputRoot, poster), subtitles: [relative(outputRoot, srt), relative(outputRoot, verticalSrt)], assets: (await readdir(assetRoot)).sort() } }, null, 2) + "\n");
    console.log(JSON.stringify({ status: "PASS", outputRoot, commit: metadata.commit, horizontal, vertical, gif, poster }));
  } finally {
    reportServer.server.close();
    appServer.server.close();
    await browser.close();
    await rm(framesRoot, { recursive: true, force: true });
  }
}

await main();
