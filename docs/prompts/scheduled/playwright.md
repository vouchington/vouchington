Review Playwright tests. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

Unit: one Playwright spec file or folder.

Load `playwright-authoring` and `playwright-rules`.

- Run the relevant local test more than once when investigating reliability; fix failures and make tests faster or leaner.
- Review AGENTS.md and README.md files for incongruence between tests and requirements.
- Do not raise timeouts or retries. If a retry is justified, retry only the smallest navigation-plus-assertion that can recover.
- Create new entities with randomized IDs instead of reusing them; add seed cases if needed; avoid mocking and long request or step sequences.
- Prebuild Cloudflare/Next.js to minimize runtime load. Add screenshots only as frontend-change verification artifacts.
- Make tests fail on browser-side errors, but never match browser or framework error-message text; assert stable application behavior or repository-owned diagnostics.
