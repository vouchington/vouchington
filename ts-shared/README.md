# ts-shared

Shared TypeScript packages used across all TypeScript workspaces ([`backend/`](../backend/), [`cloudflare-worker/`](../cloudflare-worker/), [`lambdas/`](../lambdas/)).

Current packages:

- `@ts-shared/deploy-environment`: package-backed non-throwing deploy-environment accessor
  (`getDeployEnvironment()` / `isDeployedEnvironment()` / `isProductionEnvironment()`). Prefers
  `ENVIRONMENT` over `NODE_ENV` — ECS sets `NODE_ENV=production` on every task regardless of
  target, so `NODE_ENV` alone cannot distinguish staging from production. Server-side only: do
  not import into web code that is bundled into the browser (`ENVIRONMENT` is never available
  client-side, and Next inlines `NODE_ENV` to `'production'` in every bundled build).
- `@ts-shared/env-contract`: typed environment-variable metadata shared by static-analysis and
  infrastructure-contract checks. Voucha owns its table while `@vouchington/utils` supplies generic grouping and
  lookup; runtime readers still read their native env surfaces.
- `@ts-shared/feature-flags`: compatibility facade over
  `@vouchington/utils/feature-flags`. The package retains Voucha's `ff` cookie name and public
  helper signatures; runtime wrappers provide the base64 codec and configured size policy for
  Node.js or browser environments.
- `@ts-shared/feed-capabilities`: Worker-safe feed, post, RSS, and trending surface capability
  catalogs. Defines intentionally different supported post types, feed types, and time ranges for
  each surface.
- `@ts-shared/money`: Voucha currency catalog adapter over package-backed integer money validation
  and exact major-unit parsing.
- `@ts-shared/languages`: Voucha language catalogs and UI locale policy over package-backed locale
  normalization and strict `Accept-Language` negotiation.
- `@ts-shared/route-classification`: Canonical public/private route-classification patterns shared
  by cloudflare-worker, web, and backend. Exports `isPrivateDiscoveryPath` (discovery denylist),
  static public site-nav path sets (web allowlist), indexable topic subpages, community reserved
  segments, and robots.txt disallow prefixes. Pure, env-agnostic — safe in Node.js and Workers.
- `@ts-shared/session-jwt`: Voucha app session/device protocol adapter for cookie claims, env
  parsing, and key rotation; delegates portable JWT signing, verification, decoding, and UUIDv7 primitives to
  `@vouchington/session-jwt`.
- `@ts-shared/ui-messages`: Typed UI chrome message catalogs (`en`/`es`/`fr`/`pt`) with
  package-backed interpolation and plural/select-plural evaluation over serializable descriptors.
  Parity-tested against the
  canonical `en` key set; its typed native-consumer manifest generates deterministic Swift and
  .NET resources in the external native-client checkout through
  `node dev/native-localization.mts --output-root <absolute-client-root> --consumer-root
<absolute-client-root>`. Native-only catalog additions live in durable feature modules under
  `ui-messages/locale-catalogs.mts` and `localization/catalog/`; the tooling-only generator composes
  the matching native locale with the canonical web locale, so web bundles and hydration payloads
  never include `native.*`.
- `@ts-shared/url-signing`: package-backed HMAC-SHA256 signing and verification for sideload image
  URLs; Voucha owns its sideload and key-rotation policy.
- `@ts-shared/user-profile-collections`: Canonical user profile relation collection catalog
  shared by backend route/service config, web profile tabs/actions, and route classification.
  Pure, env-agnostic — safe in Node.js, browsers, and Workers.
- `@ts-shared/utm`: Caller-configured facade over `@vouchington/utils/utm`; it binds Voucha's
  shortcode aliases and `ref` fallback while the package owns UTM parsing and normalization.
- `@ts-shared/utils`: Pure utilities shared across web, backend, and Cloudflare Worker. Portable
  collection, cookie parse, date, formatting, GTIN, bigint, query, slug, string, text-metric, URL,
  and validation algorithms delegate to explicit `@vouchington/utils` subpaths. The facade retains
  Voucha import paths, cursor/error/sentinel contracts, HTML escape/decode configuration, Fetch-safe
  test-port policy, trust tiers, moderation catalogs, and publisher-type constants. HTML helpers
  (including inline-script JSON escape) delegate to `@vouchington/html-utils`; phone-number
  validation uses the Worker-safe `phone` package.

Each sub-package is declared in the root `pnpm-workspace.yaml`, so
`pnpm install --frozen-lockfile --filter ./backend...` installs all needed
`@ts-shared/*` packages and their dependencies into the pnpm workspace graph.
There is no root `ts-shared/package.json`.

For [`lambdas/`](../lambdas/), each sub-package is referenced through `workspace:` dependencies
in the lambda's `package.json`.

In the production Docker image, the builder stage runs
`pnpm deploy --filter @voucha/backend --prod /prod/backend --legacy` after
building backend artifacts. The runtime stage copies that portable deploy output
instead of copying workspace source trees plus `node_modules` symlinks.
