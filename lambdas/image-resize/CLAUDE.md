# Image Resize Lambda

Use [README.md](README.md) for commands, architecture, request envelopes (`/images/*`, `/sideload/*`,
`/og/*`), caching, SSRF rules, and sideload clients. Before adding or changing a Vitest test,
fixture, or mock, load the
[vitest-test-authoring skill](../../.agents/skills/vitest-test-authoring/SKILL.md).

## Scoped invariants

- Bump `CACHE_VERSION` whenever resizing behavior changes so immutable cached objects cannot retain
  old semantics. Does not apply to `/og/*` — OG responses bypass the S3 render cache entirely (see
  README § OG cards). `/og/*`'s own immutable CloudFront edge cache is instead invalidated by
  bumping `OG_RENDERER_VERSION` in `web/lib/seo/og-image-url.ts` whenever the satori/sharp renderer,
  fonts, or card layout change (issue #8046) — this Lambda ignores the field, it is purely a cache
  key baked into the signed payload.
- Preserve HMAC authentication and public-address DNS validation for sideload requests; every
  redirect target must be revalidated. `/og/*` reuses the same HMAC signing keys/gating (path-only
  signature) but is never subject to SSRF/DNS validation since it never fetches an arbitrary URL —
  avatars are read directly from S3 by key.
- `/og/*` must never perform an outbound HTTP fetch (avatars are read via `fetchImageFromS3`, not a
  URL fetch) — that is the entire point of moving OG rendering into this Lambda for the IPv6-only
  egress flip (issue #7987).
- Keep runtime configuration synchronized with the Lambda deployment owned by
  `vouchington/vouchington-infra`. The successful `main-lambdas` workflow publishes the validated,
  attempt-bound ZIP; private infrastructure verifies that exact source-run artifact, persists it in
  its deployment store, and owns the rollout. Infrastructure changes belong in that repository.
- Origin S3 objects and sideload fetches over `MAX_INPUT_IMAGE_BYTES`, and Sharp inputs over
  `MAX_INPUT_PIXELS`, must 413 on `/images/*` and `/sideload/*` rather than buffering or decoding
  unbounded payloads. `/og/*` applies the same caps at S3 read and Sharp decode, then falls back to
  the initial-letter placeholder (HTTP 200) instead of failing the card. See [README.md](README.md).
