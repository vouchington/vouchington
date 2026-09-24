# Workflow automation map

[Back to Workflow Reference](README.md) · [Back to Workflow inventory](WORKFLOWS.md)

Each workflow sits in one section, chosen by what triggers it automatically. Manual
`workflow_dispatch` does not change its section.

- [Always run](#always-run): runs for both pull requests and `main`, on a schedule, or from a
  comment command.
- [Pull requests](#pull-requests): runs only for pull requests or the merge queue, including
  `workflow_run` followers of CI.
- [Main](#main): runs only for `main`, from a push or a `workflow_run` on `main`.

Reusable workflows that CI calls appear as CI jobs under Pull requests.
`static-code-analysis` and `tests-portability` also run directly on a push to `main`, so they
appear under Main too. The `Main` ruleset requires `tests` and `build` (Pull requests) and
`gitleaks` (Always run) before merge.

## Always run

`gitleaks`, `actionlint`, and `lint-links` fail on `main` into `fix-main` (see [Main](#main)).
Comment commands and `scheduled-prompts` start Auto Harness runs through the reusable
`harness-dispatch` workflow; see [Auto Harness automation](reference-harness-automation.md).

```mermaid
flowchart LR
    subgraph pr-and-main["Pull requests and pushes to main"]
        gitleaks["gitleaks<br/>(secret scan; also merge queue; required check)"]
        actionlint["actionlint<br/>(workflow lint + security audit)"]
        lint-links["lint-links<br/>(repository link check; also Mondays 06:00)"]
    end
    subgraph schedules["Schedules (UTC) and manual dispatch"]
        cleanup-artifacts["cleanup-artifacts<br/>(stale sweep every 6 hours; also reusable)"]
        ghcr-cleanup["ghcr-cleanup<br/>(prunes container versions; Mondays 04:00)"]
        pnpm-dedupe["pnpm-dedupe<br/>(lockfile PR; Sundays 12:00)"]
        scheduled-prompts["scheduled-prompts<br/>(08:00-18:00 every 2 hours)"]
    end
    subgraph comment-commands["Comment commands from OWNER, COLLABORATOR, or MEMBER"]
        fix-issue-comment["/fix on an issue"]
        plan-comment["/plan on an issue"]
        shepherd-comment["/shepherd on a PR"]
        fix-issue-comment --> fix-issue["fix-issue"]
        plan-comment --> plan["plan"]
        shepherd-comment --> shepherd["shepherd"]
    end
    harness-dispatch["harness-dispatch<br/>(reusable)"]
    fix-main-ref["fix-main<br/>(see Main)"]
    pr-and-main -. "workflow_run failure on main" .-> fix-main-ref
    scheduled-prompts --> harness-dispatch
    fix-issue --> harness-dispatch
    plan --> harness-dispatch
    shepherd --> harness-dispatch
```

## Pull requests

`ci.yml` orchestrates pull requests and merge groups. Every gated job needs `detect-changes` and
`select-ci`, and `static-code-analysis` gates all of them (`backend-smoke` through
`static-backend`), so those edges are drawn once to the group. Docs-only changes skip the gated
jobs. `select-ci` can skip, shard, or narrow a job on a pull request and selects the full suite
for merge groups. The rounded join node is not a job: both Playwright suites wait for every area
static check and application Vitest root. Test-to-test edges accept a skipped upstream but not a
failed one; see the
semantic CI DAG in [CLAUDE.md](CLAUDE.md). For the exact job graph, run
`pnpm run ci:topology --format mermaid --workflow .github/workflows/ci.yml`.

```mermaid
flowchart TD
    pr-trigger["pull_request / merge_group checks_requested"]
    pr-trigger --> ci["ci<br/>(CI orchestrator)"]
    pr-trigger --> label-pr["label-pr<br/>(PR labeling; pull requests only)"]
    ci --> detect-changes["detect-changes"]
    detect-changes --> static-code-analysis["static-code-analysis<br/>(cross-repo lint + policy)"]
    detect-changes --> select-ci["select-ci<br/>(PR selection; full suite for merge groups)"]

    subgraph gated["Gated jobs"]
        static-backend["static-backend<br/>(area static)"]
        static-web["static-web<br/>(area static + shared web build)"]
        static-lambdas["static-lambdas<br/>(area static)"]
        static-cloudflare-worker["static-cloudflare-worker<br/>(area static)"]
        test-ts-shared["test-ts-shared"]
        static-backend --> test-backend-modules["test-backend-modules"] & test-backend-unit["test-backend-unit"] & test-backend-credentialed["test-backend-credentialed"]
        static-backend --> test-postgres-schema["test-postgres-schema"] & test-explain-analyze["test-explain-analyze"] & backend-smoke["backend-smoke<br/>(migrations + API/worker smoke)"]
        test-ts-shared --> test-backend-modules & test-backend-unit & test-backend-credentialed
        static-web --> test-web["test-web"] & test-web-api["test-web-api"] & test-web-integration["test-web-integration"]
        test-web --> test-web-api & test-web-integration
        static-lambdas --> test-lambdas["test-lambdas"]
        static-cloudflare-worker --> test-cloudflare-worker["test-cloudflare-worker"]
        app-vitest-done(["join: area static + application Vitest roots<br/>passed or skipped"])
        test-ts-shared & test-backend-modules & test-backend-unit & test-postgres-schema --> app-vitest-done
        test-web & test-web-api & test-web-integration & test-lambdas & test-cloudflare-worker --> app-vitest-done
        app-vitest-done --> test-playwright["test-playwright"]
        app-vitest-done --> test-playwright-credentialed["test-playwright-credentialed<br/>(trusted secret context only)"]
        test-backend-credentialed --> test-playwright-credentialed
        initialize-smoke-test["initialize-smoke-test"]
        storybook["storybook<br/>(tests + build)"]
        test-tooling["test-tooling"]
        test-portability["test-portability<br/>(macOS + Linux)"]
    end

    static-code-analysis --> gated
    select-ci -. "skip / shard / narrow" .-> gated
    gated -- "Vitest, Storybook, tooling, portability" --> test-coverage["test-coverage<br/>(Patch Coverage gate)"]
    gated -. "pull requests only" .-> upload-codecov["upload-codecov<br/>(OIDC; informational)"]
    gated -- "directly or through test-coverage" --> tests-processing["tests-processing<br/>(report merge + fan-in)"]
    static-code-analysis --> tests-processing
    test-coverage --> tests-processing
    tests-processing --> tests["tests ✓"]
    tests -- "success, trusted secrets, image changes" --> build-backend["build-backend<br/>(api + worker images)"]
    tests -- "success, trusted secrets, image changes" --> build-web["build-web<br/>(web image)"]
    select-ci -. "full-ci / run-build-*" .-> build-backend & build-web
    tests & build-backend & build-web --> build["build ✓"]

    ci -. "workflow_run completed<br/>(Dependabot PRs)" .-> fix-dependabot["fix-dependabot"]
    fix-dependabot --> harness-dispatch["harness-dispatch<br/>(reusable)"]
```

## Main

Each deployable workflow validates and publishes on its own. When one succeeds from a push,
`dispatch-completed-deploy` sends its event to the private infrastructure receiver, which owns
deploy ordering; the event names are in the
[deployment CI/CD flow](../../docs/overview/infrastructure/reference-deployment-ci-cd-flow.md).
`fix-main` subscribes to every workflow that runs on `main`, including the Always run checks, and
hands failures to Auto Harness.

```mermaid
flowchart TD
    main-push["push to main"]

    subgraph deployables["Deployable workflows"]
        subgraph main-backend["main-backend"]
            mb-static["static-checks"]
            mb-static --> mb-tests["modules, unit, smoke,<br/>credentialed, schema tests"]
            mb-static --> mb-publish["publish-backend-images"]
        end
        subgraph main-web["main-web"]
            mw-detect["detect-web-deploy"]
            mw-static["static-checks"]
            mw-detect --> mw-intent["web-deploy-intent"]
            mw-detect & mw-static --> mw-publish["publish-web-images"]
            mw-static --> mw-tests["test-web, test-web-api,<br/>test-web-integration"]
            mw-static --> mw-playwright["playwright-tests,<br/>playwright-credentialed-tests"]
            mw-playwright --> mw-otel["store-playwright-otel"]
            mw-tests & mw-playwright & mw-otel --> mw-cleanup["cleanup-artifacts<br/>(no failures)"]
        end
        subgraph main-cloudflare-worker["main-cloudflare-worker"]
            mcw-static["static-checks"]
            mcw-static --> mcw-tests["cloudflare-worker-tests"]
            mcw-static & mcw-tests --> mcw-publish["publish-cloudflare-worker"]
        end
        subgraph main-lambdas["main-lambdas"]
            ml-static["static-checks"]
            ml-static --> ml-tests["lambdas-tests"]
            ml-static & ml-tests --> ml-publish["publish-image-resize"]
        end
        subgraph main-storybook["main-storybook"]
            ms-build["storybook-build"]
            ms-build --> ms-publish["publish-storybook"]
        end
        docs-publish["docs-publish<br/>(docs artifact)"]
        sync-articles["sync-articles<br/>(articles artifact)"]
    end

    subgraph check-only["Check-only workflows"]
        subgraph main-checks["main-checks"]
            mc-select["select-main-checks"]
            mc-select --> mc-tests["tooling, ts-shared,<br/>explain-analyze"]
            mc-tests --> mc-cleanup["cleanup-artifacts<br/>(no failures)"]
        end
        static-code-analysis["static-code-analysis<br/>(also a CI job)"]
        tests-portability["tests-portability<br/>(also a CI job)"]
    end

    always-checks["gitleaks, actionlint, lint-links<br/>(see Always run)"]

    main-push --> deployables
    main-push --> check-only
    deployables -. "workflow_run success from push" .-> dispatch-completed-deploy["dispatch-completed-deploy"]
    dispatch-completed-deploy --> infra-receiver["private infrastructure receiver<br/>(one event per deployable)"]

    deployables -. "failure" .-> fix-main["fix-main<br/>(Auto Harness fix)"]
    check-only -. "failure" .-> fix-main
    always-checks -. "failure on main" .-> fix-main
    dispatch-completed-deploy -. "failure" .-> fix-main
    fix-main --> harness-dispatch["harness-dispatch<br/>(reusable)"]
    fix-main -. "workflow_run completed" .-> fix-main-self-retry["fix-main-self-retry"]
    fix-main-self-retry -. "bounded rerun" .-> fix-main
```
