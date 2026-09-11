# Website Specifications

Voucha tracks the Website Specification checklist for public web, agent, security, privacy, resilience, performance, and internationalisation surfaces.

## Agent And Machine Discovery

- `cloudflare-worker/src/inline-responses.mts` owns `/llms.txt`, `/llms-full.txt`, and applicable `.well-known` discovery documents.
- `cloudflare-worker/src/specification-documents.mts` owns the inline document bodies for LLM and selected `.well-known` resources.
- `cloudflare-worker/src/api-catalog.mts` owns the linkset JSON served at `/.well-known/api-catalog`.
- `cloudflare-worker/src/robots-txt.mts` must not disallow public `/md/` routes, because `/llms.txt` advertises them as machine-readable public content.
- `cloudflare-worker/src/markdown-aliases.mts` maps predictable `.md` page aliases to backend `/md/*` routes; backend detail routes must follow the cached canonical-id lookup contract in [backend/md/README.md](../../../backend/md/README.md).
- `cloudflare-worker/src/discovery.mts` advertises key machine-readable resources with HTTP `Link` headers on public unauthenticated responses.
- `integration-tests/web/tests/website-spec.mts` verifies the local Worker-served discovery surfaces, markdown alternates, and private-resource omissions.

## Security And Privacy

- `/.well-known/security.txt` is served from the Worker and should be kept current with the public security contact/policy URL.
- Third-party script loads should use Subresource Integrity when the URL is stable. Dynamic providers such as GTM, Turnstile, OAuth, and reCAPTCHA may be documented exceptions when protected by CSP, nonce, allowlisted origins, and consent gating.
- Global Privacy Control (`Sec-GPC: 1` or `navigator.globalPrivacyControl === true`) is treated as an opt-out from non-essential tracking.

## Resilience And Performance

- Worker maintenance mode is controlled by `MAINTENANCE_MODE=true` and returns `503` with `Retry-After`.
- The service worker provides a navigation-only offline fallback while preserving push-notification behavior.
- The Worker emits `No-Vary-Search` for tracking parameters that do not change public content.

## Internationalisation Policy

Voucha currently supports a language preference for UI selection, but public indexing is English-first. Because there is no localized URL strategy yet, public pages should not emit `hreflang` alternates. If multilingual public indexing is introduced, add localized URL policy, localized metadata, sitemap alternates, language switcher behavior, and RTL `dir` handling in the same change.
