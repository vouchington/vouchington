# Workflow automation map

[Back to Workflow Reference](README.md) · [Back to Workflow inventory](WORKFLOWS.md)

Each workflow appears in one of three Mermaid diagrams, chosen by what triggers it automatically.
Manual `workflow_dispatch` does not change its diagram.

- [Always run](reference-workflow-automation-always-run.md): runs for both pull requests and
  `main`, on a schedule, or from a comment command.
- [Pull requests](reference-workflow-automation-pull-requests.md): runs only for pull requests or
  the merge queue, including `workflow_run` followers of CI.
- [Main](reference-workflow-automation-main.md): runs only for `main`, from a push or a
  `workflow_run` on `main`.

Reusable workflows that CI or an area workflow calls appear as jobs in Pull requests. The area
workflows also run in full from `nightly` (Always run). The [Main ruleset's required gates](CLAUDE.md#scoped-invariants)
are defined in the workflow invariants.
