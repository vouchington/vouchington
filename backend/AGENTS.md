# Backend

- Load skills: `typescript-authoring`, `typescript-rules`, `http-api-design`, `integrations-rules`, `structured-logging`.
- Architecture: [overview index](../docs/overview/architecture/README.md).
- Anonymous list endpoints clamp their limit with `clampAnonLimit`.
- Store bearer, OAuth/social, TOTP, and OTP secrets through `@modules/token-secrets`, never raw.
- Report errors through `@modules/on-error`.
- Use `index.mts` barrels. Development and tests run sources directly; only the image build compiles
  them (`scripts/build/compile-backend-binaries.mts`), so a new run-time file read relative to a
  module must be staged there. Generic utilities belong in `backend/modules/` (`@modules/foo`),
  never `backend/lib/`. Functions receiving a user take `currentUser`/`currentUserId` first.
- Each direct external API call has its own function tagged `/* no-mistakes: integration=<provider> */`.
- Backend returns structured entity references, never frontend routes; the web resolves URLs with
  `web/lib/links/entity-href.ts`.
- When MCP tools or their REST twins change inputs/outputs, update checked-in contracts, tool
  schemas, fixtures, and the MCP catalog together, and test handler results and rejections against
  the declared schemas.
- Third-party browser SDK/API origins are registered in `REGISTERED_WEB_CSP_ORIGINS` and
  `buildWebCsp()` (`cloudflare-worker/src/csp.mts`). State in a code comment whether an
  integration fails open (paid/advisory signals) or closed (security hard gates).
