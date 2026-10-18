# Artifact Rerun Safety

Area workflows use full LCOV artifacts only as a same-run handoff to their own patch-coverage job.
A failed attempt may leave an unfinalized artifact name, so callers retry the upload once under a
`-retry` name. A selected area cannot pass its required
gate without the LCOV evidence its patch rules need. Codecov receives the same report as
informational evidence and is never a required check.

Every artifact name must stay classified `keep` or `delete` in
[`ci/cleanup-artifacts-patterns.json`](../../../../ci/cleanup-artifacts-patterns.json). The trusted
sweep removes delete-classified artifacts only from successful or cancelled runs, because a rerun of
a failed run may need its same-run handoffs. Pull-request workflows get no `actions: write` for
cleanup because their definitions are PR-controlled.

JUnit reports produced by selected test jobs are uploaded as one-day artifacts on every
non-cancelled completion, including successful runs. The report files are cleared before execution,
and their artifact names are explicitly classified `keep`, so no-skip audits can inspect completed
test counts without weakening test outcomes or retaining reports long term.

Keep required producer-consumer handoffs visible to the workflow topology model, which resolves only
same-run jobs, including local reusable workflows.
