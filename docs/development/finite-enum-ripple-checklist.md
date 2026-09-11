# Finite Enum Ripple Checklist

Use this checklist before removing or renaming a finite enum value such as a `topic_type`,
`post_type`, route slug, discriminator, or similar closed string set.

The goal is to remove stale literals before the first push, not to discover them through serial fix
commits.

## Checklist

- Update the canonical runtime/type definitions and database source of truth together, including
  TypeScript unions, runtime config maps, SQL enums, CHECK constraints, comments, and migrations.
- Update web route surfaces for public finite sets. Topic and post type routes use explicit
  directories and route factories, not catch-all `[topicType]` or `[postType]` segments.
- Update helper maps and formatters that translate enum values to slugs, labels, tabs, sitemap keys,
  API params, RSS URLs, canonical links, and admin/review-queue links.
- Update generated or generated-style tests, test helpers, mock factories, route smoke tests,
  sitemap tests, and static-analysis fixtures that enumerate the values.
- Update seed data and CSV-backed import data, including dev seeds, Playwright seeds, explain-analyze
  seeds, and validation scripts.
- Update docs that name the values, especially requirement matrices, route docs, SEO/sitemap docs,
  and workspace `CLAUDE.md` files.
- If a value is renamed, check both the old and new value. If a value is removed, check the removed
  value and any old route slug.

## Purge Scan

Run literal scans before the first push and inspect every remaining match:

```bash
rg -n "old_value|old-slug|Old Label" backend web ts-shared docs static-code-analysis integration-tests playwright
```

For route-slug changes, also scan path names:

```bash
rg --files backend web docs static-code-analysis integration-tests playwright | rg "old-slug|old_value"
```

For package-boundary, CI, env var, or infrastructure names, use the rename audit too:

```bash
./dev/audit-rename OLD_NAME NEW_NAME
```

The audit groups matches by path category. Treat each remaining old-name hit as intended,
unrelated, or fix-required before first push.

## Static Coverage

`pnpm run repo-file-policy` checks several finite enum surfaces so stale high-risk values fail
locally and in CI:

- backend and web `topicTypes` runtime maps
- `topic_types` and `post_types` SQL enum values
- explicit topic route directories
- public post route directories and route config maps

The static guard is intentionally narrow. The purge scan above is still required for behavior,
fixtures, docs, and one-off helper literals outside the known surfaces.
