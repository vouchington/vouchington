# Filaments Impact Recipes

Use these recipes before changing a boundary that crosses packages, runtimes, or generated
artifacts. Start with `no-mistakes`, then use the listed exact searches to cover Filaments-specific
joins that its graph does not model. The [archived generic recipes](https://github.com/jonathanong/filaments/blob/9c16169c0ef234bccd79aea5a50216505f0c8b7c/.agents/skills/no-mistakes/references/impact-recipes.md)
remain the reference for React props, selectors, exports, and test deletion.

Run commands from the repository root. Replace angle-bracket placeholders with literal paths or
identifiers; quote search values that contain punctuation. Batch the initial analysis across every
known compatible file, including files in different workspaces. Use one invocation per command,
config, framework, and environment; reserve single-file calls for focused post-batch diagnosis.

## Endpoint Migration

Use this when changing a URL, hostname, origin, endpoint path, or credential-shaped URL literal.
Classify every match as updated, intentionally retained for a compatible reader, generated at
runtime, or a non-consumer with evidence; `git grep` searches tracked dotfiles as well as ordinary
source files.

1. Search old and new values, then classify URL producers and consumers:

   ```sh
   git grep -n -F '<old-url-or-host>'
   git grep -n -F '<new-url-or-host>'
   git grep -n -F 'NEXT_PUBLIC_' -- web backend cloudflare-worker
   git grep -n -F 'presign' -- backend cloudflare-worker
   git grep -n -F 'Content-Security-Policy' -- . ':!node_modules'
   git grep -n -F '<old-host>' -- web backend cloudflare-worker .github
   git -C '<vouchington-infra-checkout>' grep -n -F '<old-url-or-host>' -- opentofu .github docs
   git -C '<vouchington-infra-checkout>' grep -n -F '<new-url-or-host>' -- opentofu .github docs
   ```

   Include runtime and server-rendered public config, generated or presigned URLs, CSP and
   exact-host allowlists, browser tests/mocks/waits, API and native consumers where applicable,
   docs and operator surfaces. The separate infrastructure search covers DNS, CloudFront, and
   OpenTofu output producers. If that checkout is unavailable, record an explicit private-repository
   handoff and do not classify the migration as complete. Classify IAM principals and similar
   identity-only references as evidence-backed non-consumers rather than changing them by string
   resemblance.

2. Prove compatibility rather than assuming deploy order. Record old/new reader and writer
   behavior, each independent deploy order, and rollback behavior. Link the evidence to
   [Networking](../../../docs/overview/infrastructure/networking.md),
   [Security](../../../docs/requirements/security/SECURITY.md), and
   [Deployment decoupling](../../../docs/overview/infrastructure/deployment.md#deploy-decoupling--independent-safety).
   The migration is complete only when old and new readers/writers remain safe through the chosen
   rollout and rollback window.

3. Before the first commit or push that changes endpoint or credential-shaped literals, run this
   exact local scan, classify any finding without exposing secret material, and record the result:

   ```sh
   pnpm exec vouchington gitleaks-directory-scan --config .gitleaks.toml
   ```

   The wrapper scans two isolated trees: the staged index snapshot and the current tracked plus
   nonignored untracked working-tree files. This catches partial-staging differences without
   exposing or allowlisting gitignored local credentials. Directory-mode fingerprints do not
   include commit IDs, so the wrapper does not pass the git-history baseline. This supplements,
   rather than changes, CI's unchanged `gitleaks git` history scan. See
   [system dependencies](../../../docs/development/system-dependencies.md#7-mise-managed-ci-tools--always-required)
   for the local pin and
   [standalone workflow checks](../../../docs/development/reference-ci-standalone-workflow-checks.md)
   for the isolated CI scan.

## Native API Parity

Use this when an endpoint, response field, or shared API fixture changes. The goal is to reach the
backend fixture source, generated contract, web client, Swift client, .NET client, final UI
consumers, and their tests.

1. Start from the backend route or client file when one is known:

   ```sh
   pnpm exec no-mistakes server related <backend-route-file> --format paths
   pnpm exec no-mistakes dependents <typescript-client-file-a> <typescript-client-file-b> --format paths
   pnpm exec no-mistakes tests plan vitest --changed-file <typescript-source-file-a> --changed-file <typescript-source-file-b> --format paths
   ```

2. Join the surfaces through a stable fixture ID, route, or JSON field. For example:

   ```sh
   rg -n -F 'native.lists.default' backend api-fixtures/v1 web
   rg -n -F '/api/v1/lists' backend api-fixtures/v1 web
   rg -n '"<jsonField>"|\b<jsonField>\b' backend api-fixtures/v1 web
   ```

   Resolve the fixture entry in `api-fixtures/v1/manifest.json`, including its `bodyFile`, route,
   and source metadata. Follow it back to `backend/test-helpers/api-fixtures/**`, then forward through
   the web manifest-coverage registries, Swift endpoint/decoding coverage, and .NET endpoint and
   ViewModel coverage. Trace each decoded web client/type symbol with `dependents` and exact `rg`,
   then search the Swift model and .NET ViewModel symbols to find the final web and native UI
   consumers and nearby tests.

3. Use native graph support from a separate
   [vouchington-clients](https://github.com/vouchington/vouchington-clients) checkout after
   identifying concrete source files:

   ```sh
   cd /absolute/path/to/vouchington-clients
   pnpm exec no-mistakes swift importers <swift-source-file> --format paths
   pnpm exec no-mistakes swift test-targets <swift-source-file> --format paths
   pnpm exec no-mistakes tests plan swift --changed-file <swift-source-file-a> --changed-file <swift-source-file-b> --format commands
   pnpm exec no-mistakes tests plan dotnet --changed-file <dotnet-source-file-a> --changed-file <dotnet-source-file-b> --format commands
   ```

Never edit `api-fixtures/v1/manifest.json`, `schema-lock.json`, or `responses/**` by hand; change the
fixture source and follow the [fixture update flow](../../../backend/test-helpers/api-fixtures/README.md):

```sh
pnpm run api-fixtures:generate
pnpm run api-fixtures:check
# Run the corresponding native contract checks from the vouchington-clients checkout.
```

Update the [client parity matrix](../../../docs/requirements/CLIENT-PARITY-MATRIX.md) only when the
user-facing capability changes, not for an internal representation-only refactor.

## Cross-Surface Contract Matrix

Use this when a feature surface must move together across web, Swift, .NET, API fixtures, routes,
authorization, lifecycle cleanup, exports, queues, or read-after-write behavior. The goal is to turn
the accepted plan into a finite contract matrix before the first push.

1. Start from the durable requirement maps:

   ```sh
   rg -n -F '<entity-or-feature>' docs/requirements/CLIENT-PARITY-MATRIX.md docs/requirements/ENTITY-ACTION-MATRIX.md docs/requirements/ENTITY-LIFECYCLE-MATRIX.md docs/requirements/anatomy
   rg -n -F '<route-or-action>' docs/requirements docs/checklists backend web api-fixtures/v1
   ```

   Record every relevant row as a matrix item. Include explicit "not applicable" decisions only
   after checking the matrix row or entity anatomy that makes the exclusion true.

2. For each matrix item, trace the concrete implementation surface:

   ```sh
   rg -n -F '<route>' backend web api-fixtures/v1
   rg -n -F '<authorization-helper-or-role>' backend web
   rg -n -F '<json-field-or-state>' backend api-fixtures/v1 web
   rg -n -F '<delete-or-export-symbol>' backend web
   ```

   The required evidence set is route reachability, authorization parity, read-after-write source
   freshness, deletion/export or lifecycle cleanup, fixture coverage, and web/Swift/.NET UI states
   for every client that the feature exposes.

3. Use `no-mistakes` once the concrete files are known:

   ```sh
   pnpm exec no-mistakes dependencies <source-file-a> <source-file-b> --format paths
   pnpm exec no-mistakes dependents <source-file-a> <source-file-b> --format paths
   pnpm exec no-mistakes tests plan vitest --changed-file <typescript-source-file-a> --changed-file <typescript-source-file-b> --format paths
   pnpm exec no-mistakes tests plan swift --changed-file <swift-source-file-a> --changed-file <swift-source-file-b> --format commands
   pnpm exec no-mistakes tests plan dotnet --changed-file <dotnet-source-file-a> --changed-file <dotnet-source-file-b> --format commands
   ```

4. Close the loop before pushing by updating the implementation ledger from
   [Implementation Rules](implementation.md#implementation-rules): each contract row needs a target
   file/test owner and an evidence status. If one client or lifecycle surface cannot ship in the PR,
   document the blocker and tracked follow-up in the PR body rather than leaving the matrix implicit.

## Proposed Import And Package Legality

Use this before adding a cross-package import. `no-mistakes resolve-check` validates imports already
present in a file; it cannot preflight a proposed specifier that has not been added yet.

1. Walk upward from the source file and stop at the first `package.json`. That file is the source
   package owner:

   ```sh
   node --experimental-import-meta-resolve --input-type=module -e "
   import { existsSync } from 'node:fs'
   import { dirname, parse, resolve } from 'node:path'
   let dir = dirname(resolve(process.argv[1]))
   const root = parse(dir).root
   while (dir !== root && !existsSync(resolve(dir, 'package.json'))) dir = dirname(dir)
   const manifest = resolve(dir, 'package.json')
   if (!existsSync(manifest)) process.exit(1)
   console.log(manifest)
   " <source-file>
   rg -n -F '"<target-package>"' <source-owner-package.json>
   ```

   Derive the bare package root from a proposed subpath such as `@queues/article-sync/enqueues`
   (`@queues/article-sync` here). It must appear in the owner's `dependencies`, `devDependencies`,
   or `optionalDependencies` section appropriate to the importing file. A declaration in the
   repository root or a different workspace package does not grant access.

2. Locate the target workspace by package name, then inspect its public entrypoints:

   ```sh
   rg -l -F '"name": "<target-package>"' --glob package.json
   rg -n '"exports"|"types"|"main"' <target-package.json>
   ```

   Confirm that the proposed package subpath is exported and maps to an existing file. Do not infer
   legality merely because `rg` found a private source file. Check Node's import-condition
   resolution from the proposed source location before editing:

   ```sh
   node --input-type=module -e "
   import { resolve } from 'node:path'
   import { pathToFileURL } from 'node:url'
   const [source, specifier] = process.argv.slice(1)
   console.log(import.meta.resolve(specifier, pathToFileURL(resolve(source))))
   " <source-file> <proposed-specifier>
   ```

   The experimental flag enables the optional parent URL argument; the one-argument
   `import.meta.resolve()` API is stable, but it would resolve from the eval module instead of the
   proposed source file. This confirms resolution, not dependency ownership; both checks must pass.
   If installed workspace links are stale after a rebase or branch switch, run bare `pnpm install`
   and retry.

3. After adding imports, validate graph impact and test selection in one whole-repository batch
   containing every compatible changed source:

   ```sh
   pnpm exec no-mistakes dependencies <source-file-a> <source-file-b> --format paths
   pnpm exec no-mistakes tests plan vitest --changed-file <source-file-a> --changed-file <source-file-b> --format paths
   ```

   After the initial batch completes, use `resolve-check` as a focused single-file diagnostic for
   the source whose new import needs confirmation. Unlike the batch-capable commands above,
   `resolve-check` accepts one file:

   ```sh
   pnpm exec no-mistakes resolve-check <source-file> --format human
   ```

## Queue And Worker Impact

Use this when changing enqueue behavior, job data, queue names, worker registration, processors,
deduplication, or call disposition.

1. Ask the queue graph first:

   ```sh
   pnpm exec no-mistakes queues related <producer-or-worker-file> --direction both --format paths
   pnpm exec no-mistakes queues edges <producer-or-worker-file> --format human
   ```

   Empty output is not proof of no impact. Filaments wraps glide-mq with helpers such as
   `createEnqueueFunction` and `createWorker`; an empty graph can mean that the wrapper is not
   supported. Continue with the fallback below.

2. Trace the producer from its exported enqueue function to every caller, and inspect whether each
   call is awaited, returned, included in an awaited or returned `Promise.all`, explicitly discarded
   with `void`, or left floating:

   ```sh
   pnpm exec no-mistakes importers <enqueue-file> --format paths
   pnpm exec no-mistakes call-sites <enqueue-file> <enqueueFunction> --format json
   rg -n -F 'export function <enqueueFunction>' backend
   rg -n '\b<enqueueFunction>\b' backend web
   rg -n 'await <enqueueFunction>|return <enqueueFunction>|void <enqueueFunction>|Promise\.all[^;]*<enqueueFunction>' backend web
   ```

   `importers` and `call-sites` can miss aliased or cross-workspace consumers, so the exact `rg`
   symbol search is authoritative even when the structural queries return results. The focused
   disposition regex is only a convenience: it may miss multiline or aliased calls and can produce
   a false positive when a later expression shares the same statement as `Promise.all`. Existing
   `no-mistakes/async-call-disposition` lint configuration enforces selected service/worker enqueue
   imports; it is not a discovery graph, and API callers still need manual classification.

3. Inspect both helper defaults and per-call overrides. Search the queue name, job name, job-data
   type, deduplication ID/mode/TTL, priority, attempts, and backoff across enqueue and queue packages:

   ```sh
   rg -n 'createEnqueueFunction|queueName|jobName|deduplication|priority|attempts|backoff' backend/queues
   rg -n -F '<queue-name>' backend/queues backend/workers backend/entrypoints
   rg -n -F '<job-name>' backend/queues backend/workers
   ```

4. Follow the same queue and job identifiers into `backend/entrypoints/**` worker registration,
   `backend/workers/**` `createWorker` calls, processor/service calls, and adjacent tests. Finish with
   one graph batch and one test-plan batch containing every discovered TypeScript file. Verify retry, deduplication, and
   replay choices against [job replayability](../../../docs/requirements/platform/JOB-REPLAYABILITY.md):

   ```sh
   pnpm exec no-mistakes dependents <discovered-file-a> <discovered-file-b> --format paths
   pnpm exec no-mistakes tests plan vitest --changed-file <discovered-file-a> --changed-file <discovered-file-b> --format paths
   ```

If a graph command misses a supported-looking relationship, preserve the exact command and minimal
example when filing a Filaments `dependencies` issue for `no-mistakes`; do not silently treat the
missing edge as a safe boundary.
