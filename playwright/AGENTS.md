# Playwright

Browser and hydration test suite. Before changing specs, helpers, fixtures, authentication, selectors,
waits, or reliability patterns, read the
[playwright-authoring skill](../.agents/skills/playwright-authoring/SKILL.md) — it owns those rules.
Use [README.md](README.md) and [tests.md](../docs/development/tests.md) for commands and patterns.
Use the [local-site-testing skill](../.agents/skills/local-site-testing/SKILL.md) for local browser QA;
do not replace the managed workflow with manual server startup.

Playwright always runs against production builds: `node server.js` (Next.js standalone) and
`wrangler dev dist/index.js --no-bundle` (CF Worker). Never uses `next dev` or on-the-fly
`wrangler dev`.

Global setup must call `pinPlaywrightSeedCrawlAnchor()` before seeding so worker processes reuse
the same crawl IDs for the full run.

## Scope

- **Playwright**: rendered UI behavior, layout geometry, responsive overflow, localStorage/cookie behavior, focus, keyboard/pointer interaction, client-side navigation, hydration warnings, console/page errors, browser network observations.
- **Not Playwright**: status codes, redirects, headers/cache, `robots.txt`, metadata, canonical links, JSON-LD, static copy → use [`integration-tests/web/`](../integration-tests/web/) instead.

## See Also

- Test suite reference: [tests/README.md](tests/README.md)
- Patterns for authentication, waiting, locator strategy, mobile viewports, hydration, CF Worker logs, CAPTCHA, async work: [README.md](README.md)
- Helper functions: [helpers/README.md](helpers/README.md)
