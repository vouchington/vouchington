Ultrathink. Prioritise depth over latency.

Scope to read before reviewing the diff:

- Every GitHub issue and PR linked from the PR body, transitively. Source issues typically predate the Plan issue (label: `plan`), which predates this PR. Build one explicit requirement list from all of them — accepted plan requirements and plain source-issue requirements alike — and verify each entry is satisfied here or explicitly deferred with a linked follow-up.
- The PR's own title and body. Read it as a set of claims to verify, not a summary to trust: every stated behaviour, checklist item, root-cause explanation, and `## Follow-ups` deferral is something the diff must actually support.
- All comments on the PR, the Plan issue, and the source issue(s).
- The root `CLAUDE.md`, every workspace `CLAUDE.md` whose directory the diff touches, and any `docs/**` files those CLAUDE.md files link to that are relevant to the change.

Review dimensions (call out concrete file:line in inline comments):

- **Necessity & alternatives** - question whether the change should exist, whether a simpler or better approach solves the underlying problem, and whether the plan or diff reflects tunnel vision; bring an independent fresh perspective.
- **Correctness & security** - auth/authz boundaries, injection, secret handling, race conditions.
- **Performance & cost** - N+1 queries, accidental full-table scans, unnecessary LLM calls, oversized fan-out, hot-path allocations.
- **Simplification** - dead code, unused exports, cruft, residue from earlier iterations.
- **Prelaunch storage** - this app has not launched. Flag upgrade-only migration deploys and compatibility readers/writers, business state in JSON, polymorphic/encoded/array relationships, and internal UUID references without target foreign keys (even if primary or unique). Preserve external protocols, exact replay, key rotation, and fresh-bootstrap integrity.
- **DRY & indirection** - duplication that should be extracted, and over-abstracted indirection that obscures intent.
- **Plan adherence** - does the diff actually deliver what the Plan issue accepted?
- **Requirement coverage & description accuracy** - walk the requirement list entry by entry. Flag any requirement the diff leaves unmet with no linked deferral, any claim in the description the diff does not support, any description text a later scope change left stale, and any substantial diff scope the description never mentions. Anchor each finding to the changed line it concerns; when a description claim has no matching diff line, raise it in the review body and quote the corrected wording.

Treat premise or alternative-approach observations as advisory unless they reveal a correctness, security, or plan-adherence blocker. The accepted plan remains authoritative under the feedback hierarchy. Treat requirement-coverage and description-accuracy findings as advisory as well: report them, do not block on them; a requirement the accepted plan made binding remains a plan-adherence blocker.

Do not run tests or lint locally. CI will run those checks.

Record every finding in `code-review-payload.json` at the repository root. Do not approve and do not call `gh` — final approval is reserved for human reviewers. Label correctness, security, or plan-adherence blockers as **BLOCKING** in the inline comments.

Write inline comments for every finding — both blockers and suggestions. Prefer inline placement over top-level summary text: a top-level comment without a corresponding inline is a missed opportunity for the author to act directly on the diff. Use GitHub suggestions (`suggestion` code blocks) for any concrete code change you'd recommend, however small.
