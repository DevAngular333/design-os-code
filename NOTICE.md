# Attribution

This repository contains the MIT-licensed Code2Flow implementation authored in
the public [`jangtrinh/design-os-code2flow`](https://github.com/jangtrinh/design-os-code2flow)
project and published here as `DevAngular333/design-os-code`. The upstream
copyright and full MIT terms remain in [`LICENSE`](LICENSE).

## DevAngular333 contribution

The account repository adds the local **Review Pack** workflow in
[`src/review/`](src/review/), the `review` CLI command, a labeled synthetic CRM
revision pair, [`scripts/smoke.mjs`](scripts/smoke.mjs), and
[`docs/case-study.md`](docs/case-study.md). Review Pack state stays in the
reviewer's browser and can be exported as JSON; it does not upload target-repo
files. The smoke command builds the viewer, scans a copied static HTML fixture
and exports a self-contained HTML flow map in a temporary directory.
