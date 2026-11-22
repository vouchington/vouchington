# Finite Enum Ripple Checklist

Voucha-specific surfaces to update when removing or renaming a finite enum value such as a
`topic_type`, `post_type`, route slug, or discriminator. The generic ripple scan (types, SQL, fixtures,
seeds, docs, purge scan) is in the `typescript-authoring` and `test-authoring` skills.

- Topic and post type routes use explicit directories and route factories, not catch-all
  `[topicType]` or `[postType]` segments; update the web route surfaces, sitemap keys, RSS URLs,
  canonical links, and admin/review-queue link maps.
- Update seed and CSV import data: dev seeds, Playwright seeds, and explain-analyze seeds.
- Check both the old and new value for a rename; for a removal, also check the old route slug.
- `pnpm run repo-file-policy` guards the topic and post type maps, SQL enums, and route directories
  ([`finite-enum-ripple-config.mts`](../../static-code-analysis/repo-file-policy/finite-enum-ripple-config.mts)).
  It is narrow: still scan with `rg` for the old value, slug, and label across `backend web ts-shared
  docs static-code-analysis integration-tests playwright`, and use `./dev/audit-rename OLD NEW` for
  package-boundary, CI, env var, or infrastructure names.
