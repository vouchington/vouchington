# Image resize Lambda

- Use [Lambda docs](../../docs/overview/infrastructure/lambdas/image-resize/README.md) for request/cache/SSRF contracts and load [Vitest authoring](../../.agents/skills/vitest-test-authoring/SKILL.md) for tests/fixtures/mocks.
- Resize changes bump `CACHE_VERSION` for immutable S3 renders. OG bypasses that cache; renderer/font/layout changes bump `OG_RENDERER_VERSION` in `web/lib/seo/og-image-url.ts` for immutable edge-cache keys. The Lambda ignores that signed-payload field.
- Sideload preserves HMAC auth, public-address DNS validation, and redirect-target revalidation. OG uses the same HMAC keys/path-only signature, but no arbitrary-URL DNS validation.
- OG never fetches outbound HTTP; avatars come from S3 through `fetchImageFromS3`.
- `/images/*` and `/sideload/*` return 413 for S3/fetch inputs above `MAX_INPUT_IMAGE_BYTES` or Sharp inputs above `MAX_INPUT_PIXELS`. OG uses the same S3/decode caps then returns an initial-letter placeholder with 200.
- Keep config aligned with `vouchington/vouchington-infra`. `main-lambdas` publishes validated attempt-bound ZIPs; private infrastructure verifies the exact source-run artifact, stores it, and owns deployment. Infrastructure edits belong there.
