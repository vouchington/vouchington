# CI/CD workflows

- Load [github-actions-checklist](../../.agents/skills/github-actions-checklist/SKILL.md) before changing workflows or composite actions.
- Choose each job's runner by the requirement split in the [canonical checklist](../../docs/checklists/github-actions.md); `runner-policy.test.mts` enforces the closed label set.
- Update `fix-main.yml` when unrestricted or direct-main `push` triggers change; its subscription regression test must pass.
- Preserve exactly these required `Main` gates: `static`, `backend`, `web`, `cloudflare-worker`, `lambdas`, `tooling`, `gitleaks`. Each area gate keeps its area name, runs with `!cancelled()`, and passes when its area is skipped. Other scans are report-only unless they feed a gate.
- Area DAGs are `changes` → optional `static-<area>` → parallel suites → `coverage` (pull requests only), `codecov`, and gate. Suites never depend on sibling suites; `changes` output selects areas instead of trigger `paths:`. `static.yml` has no `changes` job; `nightly.yml` calls every area. Preserve `area-workflows.test.mts` and `area-coverage.test.mts` contracts.
- The `workflow-topology-policy` rule in [`.no-mistakes.yml`](../../.no-mistakes.yml) owns the job inventory, required jobs and edges,
  reusable callers, unlocked-workflow reasons, concurrency intent, and group collisions; update its
  data with the workflow. `if:` entailment, permission comparison, and secret-readiness checks run
  through `vouchington-tooling/workflow-policy`. This repository still owns the secret inventory and
  workflow-file reads.
- Validate and dispatch backend api+workers, image-resize Lambda, Cloudflare Worker, and web independently. Only api↔workers share a deploy unit; private infrastructure owns deployment ordering. Preserve independent artifact safety under [deploy decoupling](../../docs/overview/infrastructure/deployment.md#deploy-decoupling--independent-safety).
- Follow the [validation checklist](../../docs/checklists/github-actions.md#checklist), run focused [GitHub Actions tests](../../docs/development/tests.md), and run `actionlint` for changed workflows.
