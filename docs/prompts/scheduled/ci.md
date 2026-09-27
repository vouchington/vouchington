Review the latest CI runs. Find one concrete, bounded improvement that is safe to ship in one PR. If none qualifies, make no repository changes and report why.

- Check the latest target-branch runs first. If target-branch CI is already failing the same way, document that before changing anything.
- Look for path filters that miss tests that should run or run expensive jobs unnecessarily.
- Look for slow setup, cache, install, build, or test steps that can be narrowed safely.
- When replacing an analyzer, compare diagnostics, execution environment, stale references, and
  measured runtime before removing the old path.
- For partial reruns, account for GitHub rerunning the selected job and its downstream dependents;
  verify reused upstream sibling artifacts and bootstrap fingerprints remain coherent and preserve
  the resource summary and exit evidence needed to diagnose the original failure.
- Before adding or widening an `actions/upload-artifact@v7` step, question whether the upload is needed. Follow the artifact and log retention policy in [CI Reference](../../development/ci.md); do not duplicate its retention matrix here.

- A new or renamed artifact name must land deliberately in the `keep` or `delete` list in
  [ci/cleanup-artifacts-patterns.json](../../../ci/cleanup-artifacts-patterns.json). Use an exact
  name or one exact prefix followed by a trailing `*`; richer glob syntax is rejected. Inspect the current retention test and upload steps before proposing a guard change. Do not claim omitted, expression-valued, or non-1 retention is untested without confirming current coverage; extend the existing test idiom only for a demonstrated gap.
- Before implementing a proposed check with new parsing/traversal machinery (e.g. an
  AST/visitor-based approach), survey the target directory/module for an existing convention that
  already solves the same problem shape — grep for the target library's canonical import alias
  (e.g. `parse as load` for the `yaml` package). Prefer extending or reusing that existing idiom;
  only introduce new machinery when the existing idiom is demonstrably insufficient, and state why.
- When changing artifact rerun handling, read and update the owning
  [Artifact Rerun Safety](../../development/ci/workflows/reference-artifact-rerun-safety.md) contract.
- Use `pnpm run ci:topology --format json` or `--format mermaid` when a change depends on
  cross-workflow calls, `needs`, or concurrency; keep intent in the typed policy, not a duplicate
  workflow inventory.
- Improve fail-fast behavior, reliability, or diagnostics without hiding real failures.
- Distinguish checks that gate merge (the [Main ruleset's required gates](../../../.github/workflows/AGENTS.md)) from report-only checks such as supply-chain and dependency scans that do
  not appear in that list; do not treat a report-only finding as a merge blocker, and call out
  explicitly if a change would promote a report-only check to required.
- Validate workflow or tooling changes with the narrowest relevant local test. If a validation
  command times out without producing a diagnostic, either (a) rerun it narrowed to only the
  changed files within budget, or (b) add an explicit `## Follow-ups` entry naming the specific
  check that never completed — never assert "no follow-ups are required" in a PR body when a
  required validation is disclosed as timed out or incomplete. Root `AGENTS.md`'s "generate
  synthetic SHA-shaped fixtures" guidance means generating the ref/SHA value at runtime, not
  embedding a 40-hex-character literal in test source.
