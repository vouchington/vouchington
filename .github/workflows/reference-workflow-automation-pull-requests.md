# Workflow automation: Pull requests

[Back to Workflow automation map](reference-workflow-automation-map.md) · [Back to Workflow Reference](README.md)

`ci.yml` orchestrates pull requests and merge groups. Every gated job needs `detect-changes` and
`select-ci`, and `static-code-analysis` gates all of them (`backend-smoke` through
`static-backend`), so those edges are drawn once to the group. Docs-only changes skip the gated
jobs. `select-ci` can skip, shard, or narrow a job on a pull request and selects the full suite
for merge groups. The rounded join node is not a job: both Playwright suites wait for every area
static check and application Vitest root. Test-to-test edges accept a skipped upstream but not a
failed one; see the semantic CI DAG in [CLAUDE.md](CLAUDE.md). For the exact job graph, run
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
