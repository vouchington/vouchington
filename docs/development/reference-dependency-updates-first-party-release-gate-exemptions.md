# First-party release-gate exemptions

[Back to Dependency Updates](reference-dependency-updates-supply-chain-policy.md#first-party-release-gate-exemptions)

The table below mirrors the `pnpm-release-age-policy` `permanentPackages` registry in
`.no-mistakes.yml`, which is the single source of truth. Every entry must have an audited
default-branch npm trusted-publishing (OIDC) workflow. Update that configuration and this table
together.

| Package                                       | Reason                                                                                                                                       | Also in `allowBuilds`?          |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `@jongleberry/api-server`                     | First-party API server utility published by the repo author.                                                                                 | No                              |
| `@jongleberry/vurst-ai`                       | First-party AI utility published by the repo author.                                                                                         | No — native package is optional |
| `@jongleberry/vurst-ai-darwin-arm64`          | First-party macOS ARM64 AI native package published by the repo author.                                                                      | No — script-free package        |
| `@jongleberry/vurst-ai-darwin-x64`            | First-party macOS x64 AI native package published by the repo author.                                                                        | No — script-free package        |
| `@jongleberry/vurst-ai-linux-arm64-gnu`       | First-party Linux ARM64 AI native package published by the repo author.                                                                      | No — script-free package        |
| `@jongleberry/vurst-ai-linux-x64-gnu`         | First-party Linux x64 AI native package published by the repo author.                                                                        | No — script-free package        |
| `@jongleberry/vurst-html`                     | First-party HTML utility published by the repo author.                                                                                       | No — native package is optional |
| `@jongleberry/vurst-html-darwin-arm64`        | First-party macOS ARM64 HTML native package published by the repo author.                                                                    | No — script-free package        |
| `@jongleberry/vurst-html-darwin-x64`          | First-party macOS x64 HTML native package published by the repo author.                                                                      | No — script-free package        |
| `@jongleberry/vurst-html-linux-arm64-gnu`     | First-party Linux ARM64 HTML native package published by the repo author.                                                                    | No — script-free package        |
| `@jongleberry/vurst-html-linux-x64-gnu`       | First-party Linux x64 HTML native package published by the repo author.                                                                      | No — script-free package        |
| `@jongleberry/vurst-markdown`                 | First-party Markdown utility published by the repo author.                                                                                   | No — native package is optional |
| `@jongleberry/vurst-markdown-darwin-arm64`    | First-party macOS ARM64 Markdown native package published by the repo author.                                                                | No — script-free package        |
| `@jongleberry/vurst-markdown-darwin-x64`      | First-party macOS x64 Markdown native package published by the repo author.                                                                  | No — script-free package        |
| `@jongleberry/vurst-markdown-linux-arm64-gnu` | First-party Linux ARM64 Markdown native package published by the repo author.                                                                | No — script-free package        |
| `@jongleberry/vurst-markdown-linux-x64-gnu`   | First-party Linux x64 Markdown native package published by the repo author.                                                                  | No — script-free package        |
| `@jongleberry/vurst-prompt`                   | First-party prompt utility published by the repo author.                                                                                     | No                              |
| `@jongleberry/vurst-runtime`                  | First-party runtime utility published by the repo author.                                                                                    | No                              |
| `@vouchington/auth`                           | First-party injected authentication protocol engines published by the repo author.                                                           | No                              |
| `@vouchington/csv`                            | First-party CSV parsing and safe serialization primitives published by the repo author.                                                      | No                              |
| `@vouchington/crawler-html`                   | First-party HTML decoding and extraction primitives published by the repo author.                                                            | No                              |
| `@vouchington/embeds`                         | First-party policy-injected HTML unfurl and oEmbed primitives published by the repo author.                                                  | No                              |
| `@vouchington/domain-verification`            | First-party DNS and well-known domain-verification primitives published by the repo author.                                                  | No                              |
| `@vouchington/frontmatter`                    | First-party deterministic YAML frontmatter serializer published by the repo author.                                                          | No                              |
| `@vouchington/html-utils`                     | First-party HTML entity and text-safe escaping primitives published by the repo author.                                                      | No                              |
| `@vouchington/http-transport`                 | First-party policy-injected HTTP transport contracts published by the repo author.                                                           | No                              |
| `@vouchington/image-resize`                   | First-party image transformation and negotiation utilities published by the repo author.                                                     | No                              |
| `@vouchington/media`                          | First-party media validation, streaming, and S3 utilities published by the repo author.                                                      | No                              |
| `@vouchington/memberships`                    | First-party membership catalog, SKU grouping, and status utilities published by the repo author.                                             | No                              |
| `@vouchington/pagination`                     | First-party pagination primitives published by the repo author.                                                                              | No                              |
| `@vouchington/phone-validation`               | First-party phone validation primitives published by the repo author.                                                                        | No                              |
| `@vouchington/postgres`                       | First-party PostgreSQL runtime published by the repo author.                                                                                 | No                              |
| `@vouchington/queue-errors`                   | First-party GlideMQ retry-classification runtime published by the repo author.                                                               | No                              |
| `@vouchington/rss-crawler`                    | First-party transport-injected RSS crawler published by the repo author.                                                                     | No                              |
| `@vouchington/rss-parser`                     | First-party RSS, Atom, RDF, and JSON Feed parser published by the repo author.                                                               | No                              |
| `@vouchington/robots`                         | First-party robots.txt parsing and evaluation primitives published by the repo author.                                                       | No                              |
| `@vouchington/session-jwt`                    | First-party portable JWT primitive library published by the repo author.                                                                     | No                              |
| `@vouchington/typed-entities`                 | First-party typed-entity alias, hierarchy, hostname, and merge primitives published by the repo author.                                      | No                              |
| `@vouchington/utils`                          | First-party generic utility primitives published by the repo author.                                                                         | No                              |
| `@vouchington/uuid-v7`                        | First-party UUIDv7 generation, validation, bounds, and conversion primitives published by the repo author.                                   | No                              |
| `@vouchington/wikimedia`                      | First-party Wikimedia API client primitives published by the repo author.                                                                    | No                              |
| `@vouchington/worker-runtime`                 | First-party generic worker queue-selection, loading, and scheduling runtime published by the repo author.                                    | No                              |
| `agent-blackboard`                            | First-party agent session client and MCP server published by the repo author.                                                                | No                              |
| `auto-harness-client`                         | First-party Auto Harness dispatch client published by the repo author.                                                                       | No                              |
| `coverage-check`                              | First-party test coverage utility published by the repo author.                                                                              | No                              |
| `eslint-plugin-no-mistakes`                   | First-party ESLint plugin published by the repo author.                                                                                      | No                              |
| `eslint-plugin-vouchington`                   | First-party Vouchington house-style ESLint plugin published by the repo author.                                                              | No                              |
| `gh-pr-attach-screenshots`                    | First-party GitHub PR helper published by the repo author.                                                                                   | No                              |
| `lingua-rs`                                   | First-party N-API native language-detection addon; uses postinstall binary download so hotfix deploys must not be blocked by the 2-day gate. | Yes — runs postinstall download |
| `no-mistakes`                                 | First-party structural analysis tool used by CI static analysis.                                                                             | No — lifecycle scripts denied   |
| `no-mistakes-darwin-arm64`                    | First-party no-mistakes native package for macOS ARM64.                                                                                      | No                              |
| `no-mistakes-linux-arm64-gnu`                 | First-party no-mistakes native package for Linux ARM64 with glibc.                                                                           | No                              |
| `no-mistakes-linux-x64-gnu`                   | First-party no-mistakes native package for Linux x64 with glibc.                                                                             | No                              |
| `no-mistakes-win32-x64-msvc`                  | First-party no-mistakes native package for Windows x64 with MSVC.                                                                            | No                              |
| `pr-shepherd`                                 | First-party PR management tool published by the repo author.                                                                                 | No                              |
| `ssrf-guard`                                  | First-party SSRF protection utility published by the repo author.                                                                            | No                              |
| `valkyries`                                   | First-party utility published by the repo author.                                                                                            | No                              |
| `vouchington-tooling`                         | First-party CLI and extractable tooling libraries published by the repo author.                                                              | No                              |

Vurst AI, HTML, and Markdown publish target-specific native packages as optional dependencies. The
wrappers have no install scripts, but retain developer build scripts, so `allowBuilds` explicitly
sets them to `false`; the script-free platform packages stay out of the map. pnpm selects the
matching package for the installation target. Prompt and runtime are script-free too.
Direct Codex sessions start without workspace dependencies and initialize task-specific tooling
inside the pinned sandbox. The Dependabot repair flow uses a script-free frozen install before
dispatching its trusted harness task; it does not download Vurst assets from GitHub Releases.

For an existing dependency or generated-output PR that needs reconciliation, use the
[Auto Harness trusted runtime policy](reference-ci-standalone-workflow-checks.md#codex-trusted-runtime-policy).

## First-party dependency-bump checklist

When bumping a first-party package, verify:

1. **`minimumReleaseAgeExclude`** — package is listed in `pnpm-workspace.yaml`. If adding a new first-party package, add it to `permanentPackages` under `pnpm-release-age-policy` in `.no-mistakes.yml`.
2. **`allowBuilds`** — if the package runs a postinstall script (binary download, native compile), add it to `allowBuilds` in `pnpm-workspace.yaml` with a concrete `true` value. Do not leave a placeholder string.
3. **Vurst native packages** — when bumping Vurst AI, HTML, or Markdown, keep all three wrappers at
   the same exact stable version and retain their direct consumer links. Verify the lockfile selects
   their script-free optional platform packages rather than package lifecycle scripts.
4. **Dependabot first-party exception** — verify the package's default-branch release workflow uses
   npm trusted publishing (OIDC), then keep the npm `cooldown.exclude` list and
   `groups.first-party.patterns` synchronized in `.github/dependabot.yml`. Packages under the
   verified `@jongleberry/*` and `@vouchington/*` release families use those scoped patterns;
   unscoped packages remain exact entries.
5. **Smoke / integration test** — if the package has native binaries or postinstall behavior, run the relevant smoke test (e.g. `pnpm exec vitest run --project backend-data-stores`) to confirm the binary loads correctly before pushing.

This dependency-bump smoke validation is separate from initializer readiness. Every successful
`./dev/initialize monorepo` or `./dev/initialize web` resolves and imports the installed native
addons used by the language-detection, AI, HTML, and Markdown consumers. If any addon fails to
resolve or import, initialization stops before pinned-tool installation and its success marker. The
diagnostic prints the failed package names and a forced frozen-install repair command; run that
command, then rerun the same initializer command. Reinstalling restores missing optional platform
packages as well as lifecycle-built addons such as `lingua-rs`. The initializer never repairs
packages automatically or invokes addon functions.

The `pnpm-release-age-policy` and `structured-config-policy` rules together enforce
the following automatically in CI:

- **Item 1** (`minimumReleaseAgeExclude`): registry drift in either direction fails, and the registry must stay synchronized with the active package graph from tracked manifests and `pnpm-lock.yaml`. Enforced by `pnpm-release-age-policy`.
- **`minimumReleaseAge`**: must be present and positive (removing or zeroing the gate is caught). Enforced by `structured-config-policy`.
- **Item 2** (`allowBuilds`): existing entries must be strict booleans — no placeholder strings. Membership is **not** enforced; forgetting to add a native package to `allowBuilds` is caught by `pnpm install` / `strictDepBuilds`, not by this check. Enforced by `structured-config-policy`.
- **Item 3** (`cooldown.exclude`): the root npm cooldown exclusions and `groups.first-party.patterns`
  are kept synchronized by `ci/dependabot-policy.test.mts`; `@jongleberry/*` and
  `@vouchington/*` cover their verified scopes, while unscoped registry entries stay exact.
