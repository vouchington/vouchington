# Web Library

Source entrypoint: [web/lib/README.md](../../../../../web/lib/README.md)

Shared utilities and helpers for [`web/`](../../../../../web/). See [../AGENTS.md](../../../../../web/AGENTS.md) for agent conventions.

## Module Index

| Module                                                    | Purpose                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`api/`](../../../../../web/lib/api/)                     | API client helpers — [`api/client/`](../../../../../web/lib/api/client/) for browser fetches, server-side fetch utilities, and `web/lib/api` module boundaries                                                                                                                                                                                |
| [`auth/`](../../../../../web/lib/auth/)                   | Authentication helpers (session reading, current user access)                                                                                                                                                                                                                                                                                 |
| [`feature-flags/`](../../../../../web/lib/feature-flags/) | Client-side feature flag cookie override helpers (`FF_COOKIE` parse/set) backed by [`@ts-shared/feature-flags`](../../../../../ts-shared/feature-flags/index.mts), capped by runtime-public `NEXT_PUBLIC_FEATURE_FLAG_COOKIE_MAX_LENGTH` (default `4096`); server-side flag reads live in [`api/server/`](../../../../../web/lib/api/server/) |
| [`gtm/`](../../../../../web/lib/gtm/)                     | Google Tag Manager custom event helpers                                                                                                                                                                                                                                                                                                       |
| [`links/`](../../../../../web/lib/links/)                 | URL builder functions for all internal routes                                                                                                                                                                                                                                                                                                 |
| [`navigation/`](../../../../../web/lib/navigation/)       | Router helpers and navigation utilities                                                                                                                                                                                                                                                                                                       |
| [`permissions/`](../../../../../web/lib/permissions/)     | Permission checks for routes and UI actions                                                                                                                                                                                                                                                                                                   |
| [`preferences/`](../../../../../web/lib/preferences/)     | `localStorage`-backed preference helpers (theme, feed settings)                                                                                                                                                                                                                                                                               |
| [`seo/`](../../../../../web/lib/seo/)                     | Metadata builders, JSON-LD helpers, canonical URL utilities                                                                                                                                                                                                                                                                                   |
| [`users/`](../../../../../web/lib/users/)                 | User helper functions (display name, avatar URL)                                                                                                                                                                                                                                                                                              |
| [`utils/`](../../../../../web/lib/utils/)                 | General-purpose utility functions shared across web                                                                                                                                                                                                                                                                                           |

## Key Conventions

- **[`api/`](../../../../../web/lib/api/) module boundary**: client API modules ([`api/client/`](../../../../../web/lib/api/client/)) must start with `'use client'`. Checked by `api-module-boundaries.test.ts`. Do not import [`api/server/`](../../../../../web/lib/api/server/) helpers in client components.
- **Feature flags** are read server-side in RSC or server actions — never in client components directly.
- **Links** use the helpers in [`links/`](../../../../../web/lib/links/) — do not hard-code route strings.

## Related

- Web agent rules: [../AGENTS.md](../../../../../web/AGENTS.md)
- Integration tests covering [`api/`](../../../../../web/lib/api/): [../../integration-tests/web-api/](../../../../../integration-tests/web-api/)
- Feature flags overview: [../../docs/overview/architecture/feature-flags.md](../../feature-flags.md)
- Shared feature flag cookie primitives: [../../ts-shared/feature-flags/index.mts](../../../../../ts-shared/feature-flags/index.mts)
