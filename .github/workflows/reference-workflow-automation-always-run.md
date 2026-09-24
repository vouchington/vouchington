# Workflow automation: Always run

[Back to Workflow automation map](reference-workflow-automation-map.md) · [Back to Workflow Reference](README.md)

Workflows that run for both pull requests and `main`, on a schedule, or from a comment command.
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
