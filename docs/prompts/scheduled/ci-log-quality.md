Review CI log quality. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

Use `review-ci-logs` to inspect the core-plus-failures window, download only representative archives, and separate real failures from misleading or excessive output.

- Check the latest target-branch runs first; fix repository-owned root causes before symptoms. Measure the job or step in bytes and lines before changing it.
- Preserve non-zero exits, complete primary errors, artifacts, summaries, resource/exit evidence, and failure fingerprints. Do not add blanket quiet flags or truncate Storybook, browser, compiler, or test diagnostics without before/after proof of equivalent failure information.
- Treat a step killed by its timeout with no output after its start banner as a diagnostics gap: make it record enough at the kill (per-file progress, a process snapshot, or the `VITEST_DIAGNOSTICS` samplers) to name the hang, rather than raising the timeout.
- Record larger or lower-confidence candidates as deferred findings without opening issues.

The PR body also needs these headings: `## Follow-ups` (exact target files, required permission scope or next owner, one bounded implementation with acceptance criteria), `## Validation` (measured evidence and the remaining before/after check), and `## Rollout / deploy safety` (how complete primary errors, artifacts, summaries, resource/exit evidence, and non-zero exits are preserved). An issue-only or findings-only fallback is forbidden.
