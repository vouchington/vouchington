# Playwright

- Load [Playwright authoring](../.agents/skills/playwright-authoring/SKILL.md) for specs/helpers/fixtures/auth/selectors/waits/reliability. [Suite docs](../docs/development/testing/playwright/README.md), [test commands](../docs/development/tests.md), [spec inventory](../docs/development/testing/playwright/tests/README.md), and [helpers](../docs/development/testing/playwright/helpers/README.md) own references.
- Local QA uses [managed site testing](../.agents/skills/local-site-testing/SKILL.md), never manual server startup.
- Always test production builds: Next standalone `node server.js` and `wrangler dev dist/index.js --no-bundle`; never `next dev` or on-the-fly Worker builds.
- Global setup calls `pinPlaywrightSeedCrawlAnchor()` before seeding so all workers share crawl IDs.
- Own rendered UI/layout/responsive overflow, storage/cookies, focus/input, navigation, hydration, console/page errors, and browser network observations.
- Status/redirect/header/cache/robots/metadata/canonical/JSON-LD/static-copy tests belong in [web integration tests](../integration-tests/web/).
