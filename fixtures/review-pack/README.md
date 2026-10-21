# Review Pack sample app

The `crm-v1/` and `crm-v2/` folders are a public-safe static CRM sample. Every
record is synthetic and labeled in the UI. Version 2 adds an order status review
screen and an unrelated profile-settings screen so the Review Pack can separate
focus-term matches from an unrelated change.

Run a local app for the browser check:

```sh
python3 -m http.server 4173 --directory fixtures/review-pack/crm-v2
```

Open `http://127.0.0.1:4173/`, then Customers → Review order status → Mark
status reviewed. The Code2Flow parser reads both folders as source revisions;
the browser check is a separate runtime check of the sample app.
