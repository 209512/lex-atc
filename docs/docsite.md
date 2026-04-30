# When to Introduce a Docs Site (MkDocs / Docusaurus)

Current default: keep `README.md + docs/` in the repo and enforce link integrity via `pnpm docs:check`.

Consider migrating to a docs site when one or more becomes true:

- Docs exceed ~20–30 pages and navigation becomes painful
- You need full-text search across docs
- You need multi-language docs maintained in parallel (beyond a small README translation)
- You need versioned docs per release
- You want a public “docs portal” with a stable URL independent of the repo UI

Suggested choices:

- MkDocs (Material): doc-first, low setup cost, strong i18n/search
- Docusaurus: product/site + docs, strong versioning, React ecosystem

