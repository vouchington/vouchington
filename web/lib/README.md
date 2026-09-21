# Web Library

Shared utilities and helpers for [`web/`](../). See [../CLAUDE.md](../CLAUDE.md) for agent conventions.

## Module Index

| Module                             | Purpose                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`api/`](api/)                     | API client helpers — [`api/client/`](api/client/) for browser fetches, server-side fetch utilities, and `web/lib/api` module boundaries                                                                                                                                                                       |
| [`auth/`](auth/)                   | Authentication helpers (session reading, current user access)                                                                                                                                                                                                                                                 |
| [`feature-flags/`](feature-flags/) | Client-side feature flag cookie override helpers (`FF_COOKIE` parse/set) backed by [`@ts-shared/feature-flags`](../../ts-shared/feature-flags/index.mts), capped by runtime-public `NEXT_PUBLIC_FEATURE_FLAG_COOKIE_MAX_LENGTH` (default `4096`); server-side flag reads live in [`api/server/`](api/server/) |
| [`gtm/`](gtm/)                     | Google Tag Manager custom event helpers                                                                                                                                                                                                                                                                       |
| [`links/`](links/)                 | URL builder functions for all internal routes                                                                                                                                                                                                                                                                 |
| [`navigation/`](navigation/)       | Router helpers and navigation utilities                                                                                                                                                                                                                                                                       |
| [`permissions/`](permissions/)     | Permission checks for routes and UI actions                                                                                                                                                                                                                                                                   |
| [`preferences/`](preferences/)     | `localStorage`-backed preference helpers (theme, feed settings)                                                                                                                                                                                                                                               |
| [`seo/`](seo/)                     | Metadata builders, JSON-LD helpers, canonical URL utilities                                                                                                                                                                                                                                                   |
| [`users/`](users/)                 | User helper functions (display name, avatar URL)                                                                                                                                                                                                                                                              |
| [`utils/`](utils/)                 | General-purpose utility functions shared across web                                                                                                                                                                                                                                                           |

## Key Conventions

- **[`api/`](api/) module boundary**: client API modules ([`api/client/`](api/client/)) must start with `'use client'`. Checked by `api-module-boundaries.test.ts`. Do not import [`api/server/`](api/server/) helpers in client components.
- **Feature flags** are read server-side in RSC or server actions — never in client components directly.
- **Links** use the helpers in [`links/`](links/) — do not hard-code route strings.

## Related

- Web agent rules: [../CLAUDE.md](../CLAUDE.md)
- Integration tests covering [`api/`](api/): [../../integration-tests/web-api/](../../integration-tests/web-api/)
- Feature flags overview: [../../docs/overview/architecture/feature-flags.md](../../docs/overview/architecture/feature-flags.md)
- Shared feature flag cookie primitives: [../../ts-shared/feature-flags/index.mts](../../ts-shared/feature-flags/index.mts)
