# Extracted Shell Scripts

[Back to Workflow Authoring Reference](AUTHORING.md#extracted-shell-scripts)

GitHub Actions echoes inline `run:` source before executing it. When a long block dominates a
step's log or contains dormant `::warning::`/`::error::` literals that look emitted, move the logic
to a checked-in script while preserving real runtime messages, exit status, and diagnostic
artifacts. Measure the same step before and after from the run log archive; do not extract short
blocks merely to reduce line count.

When moving workflow shell into `ci/*.sh` or `ci/install-*.sh`, keep ownership and failure behavior
visible in review:

- Add the script path to any workflow-level `pull_request.paths` and `push.paths` filters for
  standalone workflows that invoke it.
- Add or verify `ci.yml` path-filter coverage for the owning reusable workflow, plus the generic
  `tooling` filter. `shell-scripts` already matches every `*.sh` via `**/*.sh`; do not add `ci/**`
  to wake initialize-smoke for a TypeScript change.
- Cover the script with a focused Vitest execution test for the successful command line and any
  intentional fallback path.
- Use `pnpm exec <tool>` for locally installed package binaries so Knip and CI both see the tool
  dependency.
- Prefer `${RUNNER_TEMP:-/tmp}` for temporary downloads and include the tool version or resolved
  revision in archive and extraction paths.
- Handle both `arm64` and `aarch64` when selecting architecture-specific artifacts.
- Do not add `|| true` until the swallowed failure has an explicit warning, a deterministic fallback,
  and a test showing the critical command still fails when it should.
