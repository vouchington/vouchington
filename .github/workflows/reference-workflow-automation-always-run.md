# Workflow automation: Always run

[Back to Workflow automation map](reference-workflow-automation-map.md) · [Back to Workflow Reference](README.md)

Workflows that run for both pull requests and `main`, on a schedule, or from a comment command.
`nightly` runs every area workflow in full at the `main` tip (see
[Pull requests](reference-workflow-automation-pull-requests.md)).
`gitleaks`, `actionlint`, and `lint-links` fail on `main` into `fix-main` (see
[Main](reference-workflow-automation-main.md)). Comment commands and `scheduled-prompts` start Auto
Harness runs through the reusable `harness-dispatch` workflow; see
[Auto Harness automation](reference-harness-automation.md).

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
        nightly["nightly<br/>(full run of every area workflow; daily 09:30)"]
        pnpm-dedupe["pnpm-dedupe<br/>(lockfile PR; Sundays 12:00)"]
        scheduled-prompts["scheduled-prompts<br/>(08:00-18:00 every 2 hours)"]
    end
    subgraph comment-commands["Authorized comment commands"]
        fix-issue-comment["/fix on an issue"]
        plan-comment["/plan on an issue"]
        shepherd-comment["/shepherd on a PR"]
        snapshot-comment["/postgresql-snapshot-update on a PR"]
        fix-issue-comment --> fix-issue["fix-issue"]
        plan-comment --> plan["plan"]
        shepherd-comment --> shepherd["shepherd"]
        snapshot-comment --> postgresql-snapshot-update["postgresql-snapshot-update<br/>(fresh schema to guarded commit)"]
    end
    harness-dispatch["harness-dispatch<br/>(reusable)"]
    fix-main-ref["fix-main<br/>(see Main)"]
    area-workflows-ref["static, backend, web, cloudflare-worker,<br/>lambdas, tooling (see Pull requests)"]
    nightly --> area-workflows-ref
    pr-and-main -. "workflow_run failure on main" .-> fix-main-ref
    scheduled-prompts --> harness-dispatch
    fix-issue --> harness-dispatch
    plan --> harness-dispatch
    shepherd --> harness-dispatch
```
