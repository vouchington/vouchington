# Self-Hosted Runner Caching

[Back to Workflow Runners](RUNNERS.md#self-hosted-runner-caching)

Self-hosted runners have persistent home directories (`~/`). Do **not** use `actions/cache` on self-hosted runners — the compress/upload/download/decompress round-trip through GitHub's cache API costs more bandwidth than it saves. Hosted runners (`ubuntu-slim`/`ubuntu-latest`) have no such persistence and start every job from a clean disk, so the same round-trip is a real win there — see the pnpm store and Playwright browser bullets below for where `actions/cache` is used on hosted jobs.

Current cache policy:

1. **Rust NAPI binaries** (from `@jongleberry/vurst-*` npm packages): installed via pnpm as regular npm packages; no local Rust compilation or NAPI binary caching is needed.

2. **Next.js build cache**: the web image build uses `buildkit-cache-dance` to preserve BuildKit
   cache mounts on ephemeral runners. Playwright keeps `web/.next/cache` only through workspace
   preservation on persistent runners; it does not upload the directory through `actions/cache`.
   Generated `.next` runtime output is still cleared before tests because stale output has caused
   false failures.

**Deliberate non-cache: Cloudflare Worker bundle** (`cloudflare-worker/dist/index.js`) — esbuild has no incremental on-disk cache and the rebundle takes only seconds; the `actions/cache` compress/upload/download roundtrip would cost as much as the build itself. The output is not preserved between runs (`dist/` is gitignored and removed by `clean-workspace`), so it rebuilds cheaply on every run regardless of runner type.

Never cache npm packages on self-hosted runners: no `node_modules`, pnpm/npm/yarn stores, `setup-node cache: ...`, or package-manager cache helper inputs — they already persist locally there (see below). Locally installed binaries and `node_modules` normally persist on self-hosted runners, but every run must assume a dirty workspace and either run `actions/checkout` with `clean: false` followed by `./.github/actions/clean-workspace` or deliberately request a full clean before using no preserved repository state. Harness dispatch uses the latter shape.

Registrations provisioned by
[vouchington-machines](https://github.com/vouchington/vouchington-machines)
remove enumerated generated build and test outputs through trusted host hooks after every job. The
host policy preserves dependency trees, package stores, and intentional build caches. The next job
must still run `clean-workspace`: host completion cleanup is disk hygiene, while Voucha's
checkout-time cleanup resets trust and tracked state.

For workflows that need the backend stack (backend tests, web integration, Playwright, explain-analyze), use the shared `setup-backend` composite action instead of repeating the backend setup sequence inline:

```yaml
- uses: ./.github/actions/setup-backend
  id: setup-backend
  with:
    runner-lifecycle: persistent
```

This action bundles `actions/setup-node`, repository pnpm activation, lifecycle-aware full-workspace installation, first-party workspace-link verification, and the explicit email-template build. A preserved workspace whose dependency/platform fingerprint matches performs one ordinary frozen install with no forced relink. On a populated workspace, a missing or changed fingerprint, or a missing, broken, or misdirected first-party link, runs a full script-free forced reconciliation followed by a full strict forced install and link verification. An entirely absent `node_modules` (for example right after a clean checkout) has nothing to reconcile: it takes a single ordinary frozen install and stamps on success, falling back to the same two-pass reconciliation only if that install still leaves an invalid first-party link. The fingerprint covers the lockfile, workspace policy, workspace manifests, pnpm configuration, install-script policy, pnpm and Node versions, ABI, platform, architecture, and libc, and is written only after successful reconciliation (or after the cold single install, once links verify). Filters and raw pnpm arguments are not accepted on persistent runners.

Artifact-backed callers should leave enough step timeout for GitHub artifact download stalls before the normal pnpm install work begins; backend fan-out jobs use at least eight minutes for `setup-backend`.

**Note:** `static-code-analysis.yml` retains its dedicated two-pass full install. Static analysis also needs to repair same-input native binary corruption that a dependency/platform fingerprint and workspace-link verification cannot prove. The retry wrapper budgets five minutes per attempt, so do not treat it as a normal warm setup cost.

What already persists locally on self-hosted runners (no `actions/cache` needed):

- **`node_modules` trees** (most trusted events): Workflows check out with `clean: false`, then immediately run `./.github/actions/clean-workspace`. The composite preserves all workspace `node_modules/` directories on every event except fork pull requests. Fork pull requests get a **full clean** so an untrusted contributor cannot leave modified package binaries that a later trusted run executes with elevated permissions.
- **Self-hosted pnpm installs**: persistent workflows with a matching dependency/platform fingerprint run one unfiltered full install without `--force`, allowing pnpm to reuse the preserved layout and local store. On a populated workspace, missing or changed provenance and structured first-party link mismatches trigger the two-pass forced reconciliation. An entirely absent `node_modules` skips that reconciliation — there is nothing populated to repair, so one ordinary install reaches the same end state and stamps directly, falling back to the two-pass reconciliation only if that install still leaves an invalid link. The stamp records that both repair passes (or the cold single install) completed for the current inputs; it does not assert that pnpm's retained metadata arrays are empty or that unchanged on-disk package contents were never corrupted, so static analysis retains its stronger unconditional repair path.
- **pnpm store**: Do not set `cache: 'pnpm'` on `actions/setup-node`. Let the local store persist on self-hosted runners. On hosted runners without that persistence (`tests-playwright.yml`'s `playwright-tests` job), cache the resolved store path (`pnpm store path --silent`, not the hardcoded `~/.pnpm-store` — wrong on pnpm 9/10's Linux XDG layout) via `actions/cache`, keyed on `pnpm-lock.yaml`'s hash with an OS-scoped restore-key prefix — the store is content-addressed, so a partial restore-key hit is still a net win.
- **Playwright browsers** (`~/.cache/ms-playwright`): On self-hosted runners, these persist — use the shared composite action (`.github/actions/setup-playwright`). On ARM64 ubicloud runners, use the composite action with `ubicloud: 'true'` or the inline equivalent in `tests-playwright.yml` to bypass Node-based extract-zip with system curl + unzip. On hosted runners, `setup-playwright` caches `~/.cache/ms-playwright` via `actions/cache`, keyed on the exact resolved `playwright-core` version with no restore-key fallback — a stale or partial browser-binary cache would be actively harmful, so a version mismatch must be a clean miss, not a partial hit.
- **Workspace build caches** (`node_modules/.cache`): The marginal speedup (~seconds) is not worth the API round-trip on self-hosted runners where these persist implicitly. Exception: `web/.next/cache` in `build-web.yml` uses `buildkit-cache-dance@v3` to persist BuildKit cache mounts across ephemeral ubicloud runs — see the workflow file for details.
- **`.cache/vite/vitest`**: moved out of `node_modules/.vite/` so it could be a single, shareable directory. Preserved by `clean-workspace` on every self-hosted runner — no `actions/cache` round-trip anywhere for this path. `tests-web.yml`'s `web-tests` job and `tests-backend-modules.yml`'s `backend-modules` job dropped their `actions/cache` restore/save steps when both relocated from billed Ubicloud to `[self-hosted, Linux, Docker, Tests]`, since the round-trip became redundant with local persistence. `web-storybook-browser` is excluded from this shared cache entirely — it keeps its per-run `$RUNNER_TEMP` isolation from PR #3276 to prevent stale module-URL poisoning in browser dynamic imports.
- **`.cache/vite/fs-module`**: Vitest 5 `fsModuleCache` directory (`vitestFsModuleCachePath` in `test-helpers/vitest-config/environment.mts`). Same persistence model as `.cache/vite/vitest` — workspace disk on self-hosted runners, never `actions/cache`. Browser Mode does not read this cache.

Every `actions/setup-node` call keeps `package-manager-cache: false`, hosted jobs included. It is **not** a no-op here: setup-node reads root `package.json`'s `packageManager` field, which is `pnpm@…`, so the built-in cache does activate for pnpm — and it activates inside the `actions/setup-node` step, which runs _before_ `ci/activate-pnpm.sh` puts pnpm on `PATH`. A hosted job that needs a real pnpm store cache adds its own explicitly-keyed `actions/cache` step after activation, as described above; leaving the built-in cache on alongside it would cache the same store twice.
