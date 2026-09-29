# Pull-request workflow automation

[Back to Workflow automation map](reference-workflow-automation-map.md) · [Back to Workflow Reference](WORKFLOWS.md)

Pull requests and merge groups start independent required checks: `static`, `backend`, `web`,
`cloudflare-worker`, `lambdas`, `tooling`, and `gitleaks`. Each area workflow uses
[`ci-detect-changes.yml`](../../../../.github/workflows/ci-detect-changes.yml) to select its own area. Selected areas run their
static checks, full owned suites, full-LCOV patch-coverage gate, and final area gate. A skipped area
reports success. Codecov uploads full LCOV only as informational evidence.

```mermaid
flowchart LR
  event[Pull request or merge group] --> static[static]
  static --> static-code-analysis[Repository policy checks]
  event --> backend[backend]
  event --> web[web]
  event --> cloudflare-worker[cloudflare-worker]
  event --> lambdas[lambdas]
  event --> tooling[tooling]
  event --> gitleaks[gitleaks]
  backend --> backendGate[backend gate]
  web --> webGate[web gate]
  cloudflare-worker --> cloudflare-worker-gate[cloudflare-worker gate]
  lambdas --> lambdasGate[lambdas gate]
  tooling --> toolingGate[tooling gate]
  event -. pull requests only .-> label-pr[PR labeling]
  static & backend & web & cloudflare-worker & lambdas & tooling -. failed Dependabot PR run .-> fix-dependabot[Dependabot failure triage]
  event -. queue dequeue on CI failure or timeout .-> merge-queue-ejection[Queue ejection triage]
  fix-dependabot & merge-queue-ejection --> harness-dispatch[Auto Harness dispatch]
```

The `static` check is its own required check. The area gates and `gitleaks` are likewise
independent required checks; there is no monolithic CI workflow or cross-area report fan-in.
Successful main workflows remain separate from this pull-request topology. See
[CI](../../ci.md) for the area contract.
