Review Playwright tests. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Run the relevant local Playwright test more than once when investigating reliability.
- Find any failures and make them more reliable.
- Find opportunities to make tests faster or leaner.
- Review CLAUDE.md and README.md files for any incongruence between tests and requirements.
- Avoid increasing timeouts and retries.
- If retrying is justified, retry the smallest navigation-plus-assertion operation that can recover;
  do not restart an unrelated setup or an entire test flow.
- Prefer creating new entities in the test instead of reusing entities.
- Use randomized IDs to avoid conflicts.
- No polling or `setTimeout`; use a proper wait for selectors, test ids, navigation, or network state.
- Add test cases via seed if needed.
- Increase coverage, reliability, or performance for the selected issue.
- Avoid long sequences of tests or steps.
- Avoid mocking; use seed data if needed.
- Do not add screenshots unless they are part of a frontend-change PR verification artifact.
- No long requests.
- Prebuild Cloudflare/Next.js and minimize runtime load.
- Tighten restrictions so tests fail on browser-side errors.
- Never match browser or framework error-message text; assert stable application behavior or
  repository-owned diagnostics instead.
