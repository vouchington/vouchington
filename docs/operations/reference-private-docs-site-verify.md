# Verify

[Back to Private Internal Reference Sites](private-docs-site.md#verify)

- Missing or wrong credentials return `401` with `WWW-Authenticate` and no private body.
- Removing or corrupting any one Cloudflare binding returns `503`, never static content.
- The same correct pair opens docs and Storybook production. It also opens the disposable trusted
  preview canary during enablement; hosted PR previews remain disabled.
- `/openapi/openapi.json`, `/psql/schema.md`, and `/psql/schema.json` return expected content.
  Representative PostgreSQL section/table Markdown and HTML routes resolve from the schema index.
- Redoc, PostgreSQL HTML, and representative Storybook stories render without console or asset
  errors.
- Production and its immutable Pages deployment URL report and execute Functions. The disposable
  trusted preview canary is deleted after enablement.
- PR Storybook runs execute build and browser CI without uploading a Pages publish artifact.
- Protected responses include private/no-store caching headers.
- The old GitHub Pages URL no longer serves Storybook after retirement.
