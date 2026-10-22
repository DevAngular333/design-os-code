# DevAngular333 visual launch pipeline

This folder contains the rerunnable renderer for the Code2Flow Review Pack launch.
It captures the checked out public-safe CRM report and sample app with Playwright,
composes the captures with original SVG graph motion, and encodes the final cuts
with FFmpeg. Raw captures and frame renders stay in the local `.media-output/`
directory and are not copied into public repositories.

## Requirements

- Node 20+.
- The Code2Flow checkout at `products/devangular333-code2flow-v1` with `npm ci` already run.
- Playwright's installed Chromium (provided by the product checkout).
- FFmpeg and FFprobe on `PATH`.

## Render

From the Code2Flow checkout:

```sh
node scripts/render-media.mjs \
  --out .media-output
```

Use `--product-root /absolute/path/to/design-os-code` when rendering from a
separate checkout. The command starts loopback servers for `docs/` and
`fixtures/review-pack/crm-v2`, captures the report and runtime path, then writes:

- `.media-output/assets/`: profile hero and three product covers as SVG + PNG.
- `.media-output/raw/`: local capture evidence and exported review JSON.
- `.media-output/dist/`: horizontal MP4, vertical MP4, GIF, poster and Vietnamese SRT.
- `.media-output/dist/media-manifest.json`: commit, source fixture, rights and output metadata.

The product source is synthetic and public-safe. The renderer records the product
commit in the manifest and validates that the captured report export contains
`status: verified` and the note `Checked the running CRM path`.
