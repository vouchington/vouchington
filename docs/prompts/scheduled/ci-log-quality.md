Review CI log quality. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

Use `$review-ci-logs` to inspect the deterministic core-plus-failures window, download only
representative log archives, and classify real failures separately from misleading or excessive
output.

- Check the latest target-branch runs first and fix repository-owned root causes before symptoms.
- Measure the selected job or step in bytes and lines before changing it.
- Preserve non-zero exits, complete primary errors, artifacts, summaries, resource/exit evidence,
  and transient-retry fingerprints.
- Do not add blanket quiet flags or truncate Storybook, browser, compiler, or test diagnostics
  without proving equivalent failure information from before/after samples.
- Skip findings already covered by open issues or pull requests. Record larger or lower-confidence
  candidates as deferred findings without opening issues automatically.
- Add focused tests and inspect the resulting PR CI archive to measure the same job or step after
  the change.

Prepare a bounded workspace patch containing the selected fix and measured audit findings. Its
proposed PR body must include:

- these literal Markdown headings: `## Summary`, `## Follow-ups`, `## Validation`, and
  `## Rollout / deploy safety`.
- These CI-log-specific headings are required in addition to the outer automation headings.
- `## Summary` — explain the bounded safe implementation and its measured effect.
- `## Follow-ups` — name the exact target workflows or files, the required token or permission
  scope (or the specifically named next owner), and one bounded implementation with acceptance
  criteria.
- `## Validation` — record the measured source evidence and name the next verification point: the
  before/after comparison or exact post-implementation check still required.
- `## Rollout / deploy safety` — explain how the implementation preserves complete primary errors, artifacts, summaries,
  resource/exit evidence, transient-retry fingerprints, and non-zero failure behavior. This heading
  records CI evidence preservation. Product changes follow [One current contract](../../../AGENTS.md).

Publish the bounded patch as the draft PR with the required title, body, and commit message. If no independently mergeable patch is confidently ready, stop and report that outcome. An issue-only or findings-only fallback is forbidden.

Also treat a step killed by its timeout with no log output after its start banner as a diagnostics
gap. Backend unit shards 1 and 9 of run 38617297518 printed only `RUN v5.0.3` and then
`The action 'Run backend tests' has timed out after 10 minutes`, so nothing named the stuck file or
process. Check that such a step records enough at the kill (per-file progress, a process or handle
snapshot, or the existing `VITEST_DIAGNOSTICS` samplers) to identify the hang, and fix that gap or
its root cause rather than raising the timeout or rerunning.
