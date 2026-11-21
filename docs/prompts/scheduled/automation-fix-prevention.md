Review recent triage-loop flake-fix pull requests (label `automation`, title beginning `Automation fix:`; merged, open, and closed-unmerged) with authenticated `gh` reads. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

Unit: one recurring failure class from the flake-fix corpus.

- Bound the corpus to the 50 most recently updated matching PRs and record the query. Use each body's `Root cause` and `Options considered` to find which failure classes recurred and whether the fix closed the cause or one symptom. A closed-unmerged fix can show a rejected generation pattern.
- This prompt is incident-driven: anchor every change to a specific flake-fix PR. [static-code-analysis.md](static-code-analysis.md) is tool-driven; do not duplicate it. Skip classes already guarded or tracked by an open issue or PR.
- Cluster by failure class before picking: test isolation and shared-state leaks, test timing and lifecycle, CI planner and guard hazards, missing-config contract violations, diff scope exceeding the failing target's blast radius, and fixes aimed at a detector's misattributed symptom rather than the real defect.

Choose one mode:

A. Preventive guard for a recurring class: a check that would have failed on the original defect, plus remediation of every current instance. Load `static-analysis-checklist` and place the rule with the [placement guide](../../development/quality/static-code-analysis/README.md#where-to-put-a-new-rule-priority-order). Behavioral classes belong in a shared test-harness invariant or regression test, not a syntactic rule. Pipeline classes belong in the flake-fix flow itself ([ci-failure-core.md](../automation/ci-failure-core.md)). If the guard flags more than ten files, follow the rollout split in that README.

B. Root-cause completeness for a symptom-only fix: finish the real fix in one bounded PR, or recommend a tracking issue when it is too large (search open and closed issues first; a recommendation never substitutes for a patch).

Grep for other live instances of the same defect; a guard that only re-fixes the patched instance adds no prevention.
