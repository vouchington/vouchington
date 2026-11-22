# Playwright

- Load skills: `playwright-authoring`, `playwright-rules`, `test-authoring`.
- Suite docs: [Playwright index](../docs/development/testing/playwright/README.md).
- Always test production builds: Next standalone `node server.js` and
  `wrangler dev dist/index.js --no-bundle`, never on-the-fly Worker builds.
- Global setup calls `pinPlaywrightSeedCrawlAnchor()` before seeding so all workers share crawl IDs.
- Own rendered UI/layout/responsive overflow, storage/cookies, focus/input, navigation, hydration,
  console/page errors, and browser network observations.
- Status/redirect/header/cache/robots/metadata/canonical/JSON-LD/static-copy tests belong in web
  integration tests (`integration-tests/web/`).
