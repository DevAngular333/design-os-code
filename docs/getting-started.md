# Getting started

For a PO-friendly walkthrough, start with the [user guide](user-guide.md).

Code2Flow turns a web codebase into a living user-flow canvas: every screen (route, modal, drawer, tab, wizard step) is a real screenshot, every arrow is an Action Trigger with `file:line` evidence and a confidence tier. Everything runs on your machine; nothing is uploaded.

Supported today: **Next.js App Router** (`app/` or `src/app/`), **React Router** (v6/v7 route trees in Vite or CRA apps) and **static HTML** folders. Detection order: Next → React Router → static HTML; `scan` prints the adapter it chose. Details and known misses: [adapters](adapters.md).

## 0. One command (recommended)

```bash
node /path/to/design-os-code/dist/cli/index.js init /path/to/repo     # config with the repo's fixed port, .gitignore entry, AGENTS.md section
node /path/to/design-os-code/dist/cli/index.js run  /path/to/repo     # starts the dev server (config `devCommand`, default `npm run dev`), scan → snapshot → stories validate → lint → export, stops the server
node /path/to/design-os-code/dist/cli/index.js run  /path/to/repo --url http://127.0.0.1:3000   # when you already run the server
```

`run` writes `.code2flow/run-summary.json`. Exit codes: 0 ran and lint found no error · 1 ran and lint found a broken link · 2 did not run (no `serverUrl`, port already in use, dev server failed, malformed manifest). Steps 1–4 below are what `run` does, one at a time.

## 1. Scan

```bash
node /path/to/design-os-code/dist/cli/index.js scan /path/to/repo
```

Writes `/path/to/repo/.code2flow/graph.json` (screens, transitions, counters) and `route-samples.json` (concrete URLs for dynamic routes found in the code). Add `.code2flow/` to that repo's `.gitignore`.

The summary names every dynamic route that still has no sample URL. Give them one in `code2flow.config.json` (see the config reference) or let the next step discover them from links on captured pages.

## 2. Snapshot

Start the app's own dev server, then:

```bash
node /path/to/design-os-code/dist/cli/index.js snapshot /path/to/repo --url http://127.0.0.1:3000
```

Every screen with a URL is opened, allowed to settle (network idle, fonts and images, a scroll sweep so lazy content mounts, stable layout for at least 1 s), grown until nothing is clipped, and captured as JPEG. Modals and drawers are additionally cropped to their `[role=dialog]`. Real titles come from the page `h1`, the dialog heading and the active tab.

Apps behind a login: run `node /path/to/design-os-code/dist/cli/index.js login /path/to/repo --url …` once, sign in by hand in the window that opens, and the session is saved to `.code2flow/storage-state.json`; every later `snapshot` uses it automatically (and `export` prints a reminder that the captures may show real account data).

Screenshots are stored as `.code2flow/shots/<hash-of-screen-id>.jpg`, so re-scanning after adding a route never mixes up images. Pages larger than the capture cap (2200 × 10000) are captured up to the cap and counted as `capture-capped`.

## 3. Serve

```bash
node /path/to/design-os-code/dist/cli/index.js serve /path/to/repo      # http://127.0.0.1:4317
```

Product map → feature page → story. `Inspect` shows the feature overview (frames collapsed) or a story canvas (frames expanded with their state screens). `Present` shows one swimlane per story with keyboard stepping: with a v2 manifest the lane follows `steps` (pills show the PRD's `via`), each `branch` is an indented sub-row under the screen it forks from, `entry`/`exit` are chips, a step with no transition in the code is a red dashed arrow, and a screen the code lacks is a red MISSING SCREEN stub. `Play` walks the same path one screenshot at a time with its evidence and a shareable step hash. `⌘K` finds any screen or story; every view is a shareable hash link.

## 4. Export

```bash
node /path/to/design-os-code/dist/cli/index.js export /path/to/repo               # one HTML per feature (or the whole app when it fits)
node /path/to/design-os-code/dist/cli/index.js export /path/to/repo --feature iam
```

The file opens offline and needs no server: viewer, fonts, data and screenshots are inside. When the whole app exceeds 14 MB, one file per feature is written; each still carries the full graph and only the screenshots are split.

`node /path/to/design-os-code/dist/cli/index.js render /path/to/repo` writes PNG hand-outs for the product map, every feature and every story lane plus `.code2flow/render/<product>-flows.pdf`. Use `--feature iam`, `--story invite-user`, `--png`, `--pdf`, `--out dir`, or `--scale 1` to narrow output; rendering remains local and reuses (or creates) the offline export HTML.

## 5. Stories (optional, recommended)

```bash
node /path/to/design-os-code/dist/cli/index.js stories scaffold /path/to/repo docs/prd/checkout.md   # writes .code2flow/stories-prompt.md
# hand the prompt pack to your coding agent (skill: code2flow-stories-from-prd) → code2flow.stories.json
node /path/to/design-os-code/dist/cli/index.js stories validate /path/to/repo                        # unknown screens, asserted-but-missing transitions
```

## 6. Ask questions instead of reading the canvas

```bash
node /path/to/design-os-code/dist/cli/index.js paths /path/to/repo --from / --to "/docs/[...parts]"   # shortest paths, each hop with trigger · confidence · file:line
node /path/to/design-os-code/dist/cli/index.js paths /path/to/repo --orphans                          # screens nothing reaches (shell nav aside)
node /path/to/design-os-code/dist/cli/index.js paths /path/to/repo --dead-ends
```

Agents: two skills ship in `.claude/skills/` — `code2flow-map-codebase` (the procedure above with the port contract and reporting format) and `code2flow-answer-flow-questions` (which output answers which question).

## 7. Lint and diff (CI)

```bash
node /path/to/design-os-code/dist/cli/index.js lint /path/to/repo --fail-on error   # broken links, orphans, dead-ends, needs-sample, login-gated; --json
node /path/to/design-os-code/dist/cli/index.js diff /path/to/repo --from previous-graph.json   # or --from /path/to/older-checkout; --exit-code, --json
```

Exit codes: `0` ok, `1` findings at or above `--fail-on` (or a command error, printed as one line), `2` usage.

## 8. Review a code change

After scanning two clean checkouts or source revisions, create a Review Pack:

```bash
node /path/to/design-os-code/dist/cli/index.js review /path/to/new-revision \
  --from /path/to/old-revision/.code2flow/graph.json \
  --focus checkout,orders \
  --before-label "main before" \
  --after-label "feature branch" \
  --before-ref "git:old-sha" \
  --after-ref "git:new-sha" \
  --out /tmp/review-pack
```

Open `review-pack.html` without a server. Changed evidence is deterministic:
added/removed screens, transitions, confidence changes and counters are listed
with parser source refs. `related`, `unrelated` and `unknown` are only
focus-term matches, not semantic impact claims. Use the status selector and
review note on each item, then choose **Export review JSON** to preserve the
human review state.

The report does not analyze GitHub online, run an AI model, or replace a browser
check. Start the target app separately and verify the relevant path yourself.

## 9. From a clone

```bash
npm i && npm run build      # dist/cli + out/viewer (fonts inlined)
node /path/to/design-os-code/dist/cli/index.js scan /path/to/repo
```

Nothing vanishes silently: everything the parser saw but did not turn into a screen or edge is a counter in `graph.json`, including existing local download links (`asset-link`), and every skipped capture is a lint finding.
