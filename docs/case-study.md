# Case study: codebase to evidence-backed flow map

## User and problem

Product and engineering teams often need to explain a web app's route map before
they can review a story, onboarding path or regression. Reading files alone
misses the connection between a UI trigger, its destination and the source line
that produced it.

## DevAngular333 contribution

This repository keeps the local parser/viewer product and adds a **Review Pack**
workflow plus a reproducible offline smoke path. Review Pack consumes two
canonical graph revisions, classifies changed screens/transitions with explicit
focus terms, preserves `file:line` source refs, and exports a self-contained
HTML checklist. A reviewer owns the final status and note for each item; the
tool does not call an AI model or claim runtime impact.

The sample app in [`fixtures/review-pack/README.md`](../fixtures/review-pack/README.md)
has two labeled synthetic revisions. Version 2 adds an order-status review path
and an unrelated profile-settings path. Running the CLI with `--focus order,status`
marks only the parser-visible order path as related; unchanged screens and edges
remain in the report for boundary checking.

The original DevAngular333 contribution also includes a smoke path in
[`scripts/smoke.mjs`](../scripts/smoke.mjs). It copies the tracked synthetic
static site to a temporary directory, runs the real CLI scan, reads the generated
canonical graph, exports the real self-contained HTML viewer, and checks that the
result contains screens, edges and the Code2Flow viewer.

```bash
npm ci
npm run smoke
```

Expected Review Pack output has the form:

```text
review  10 changed item(s), 4 unchanged screen(s), 12 unchanged edge(s)
review  .../review-pack.html
review  .../review-pack.json
```

Expected smoke output has the form:

```json
{"status":"PASS","adapter":"Static HTML","screens":8,"edges":13,"export":"input-flows.html"}
```

The exact counts can change with the fixture; the smoke requires a non-empty
graph and a self-contained export.

## Evidence boundary

The smoke is offline and uses a synthetic fixture. It does not prove a target
application's screenshots, browser capture, accessibility, or product team's
interpretation. Those paths need a running target app and a compatible Chrome
environment. See the upstream user guide and confidence policy for the complete
capture contract.
