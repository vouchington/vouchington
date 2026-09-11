Review CI log quality. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

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
  resource/exit evidence, transient-retry fingerprints, and non-zero failure behavior during
  rollout.

Publish the bounded patch as the draft PR with the required title, body, and commit message. If no independently mergeable patch is confidently ready, stop and report that outcome. An issue-only or findings-only fallback is forbidden.
