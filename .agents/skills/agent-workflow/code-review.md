## Code Review

### Local Self-Review

- For a substantive local diff, the orchestrator normally dispatches the Codex `self-review` agent or a Claude Code general-purpose Opus subagent after implementation and before the targeted before-push commands. It may skip this only for a no-op or trivially mechanical change and should record why.
- Local self-review is read-only. The reviewer may use non-mutating Bash commands, `rg`, and `pnpm exec no-mistakes` to inspect the diff and its impact, but it returns findings to the orchestrator instead of editing files or submitting a GitHub review.
- Return findings first, ordered by severity, with file and line references. If there are no findings, say so and identify residual validation risks. Route fixes back through the implementation role, then repeat self-review when the diff changed materially.

### Reviewer Responsibilities

- Review the PR diff and all issues or PRs linked from the PR body, including `Closes #N`, `Fixes #N`, `Resolves #N`, and `Refs #N` entries.
- Treat timestamps as part of the context. The source issue usually predates the accepted plan issue, and the plan issue usually predates the PR implementation.
- Verify that the implementation satisfies linked requirements according to the feedback hierarchy: human intervention, accepted plan, GitHub issues, then AI reviewers. If a linked requirement is intentionally deferred, require the PR body to explain the deferral and link a follow-up issue.
- Verify the PR body against the diff: flag claims the diff does not support, description text a later scope change left stale, and substantial scope the description never mentions. These are advisory findings, not blockers.
- Check that plan changes after acceptance are recorded as comments on the plan issue with the reason for the change.
- Check that material implementation, scope, validation, or review-resolution decisions follow the shared feedback hierarchy: human intervention, accepted plan, GitHub issues, then AI reviewers.
- Check that material decisions are recorded on the accepted plan issue when one exists, and in the shepherd journal when the PR is being managed through `pr-shepherd`. If neither record exists yet, they should be captured in the saved plan or PR notes.
- Independently question the premise and approach even when the diff follows the accepted plan: ask whether the change should exist, whether a simpler or better approach would solve the underlying problem, and which assumptions the plan or implementation inherited. Bring a fresh perspective instead of limiting review to the requested solution.
- Independently read applicable local instructions and check the actual schema/interface against them; do not merely verify agreement with the Plan. For database changes, trace identifier readers and joins, then inspect their concrete foreign-key coverage, constraints, and deletion behavior against the owning schema rules. A typed union or `CHECK` is not proof that a generic type-plus-ID relationship is allowed; labeling a joined identifier historical does not justify missing foreign keys. Verify any compatibility/activation/nullability rationale against established launch state, rather than inferring a live rollout from infrastructure. Missing evidence for a policy exception is a finding, not an implicit exemption.
- Treat a no-change recommendation or alternative approach as advisory unless it exposes a correctness, security, or plan-adherence blocker. The accepted plan remains authoritative under the shared feedback hierarchy.
- Leave inline comments on specific changed lines. Use GitHub suggestions when the fix is small and unambiguous.
- Do not replace inline findings with a high-level summary. Summaries are optional and secondary to actionable inline comments.

### Review Inputs

Before commenting, collect:

- PR title, body, changed files, and existing review comments.
- All linked source issues, accepted plan issues, and related PRs.
- The accepted plan text and any follow-up comments that changed the plan.
- CI status when available.

### Findings

Prioritize correctness, requirement gaps, regressions, missing tests, security, data safety, and user-visible behavior. For each finding, make the affected requirement clear by referencing the linked issue or plan when relevant.

### Agent-Authored PR Creation Feedback

When a triage flow reviews a verified agent-authored PR, assess how its generator
could create a better PR next time. Apply this to both merged and closed PRs. Skip
human-authored PRs, and do not guess when authorship or generator provenance is
unknown. See [pr-description](../pr-description/SKILL.md) for the concrete
PR-description standard this rubric evaluates against.

Evaluate description quality, root-cause analysis, scope discipline, validation,
appropriate test coverage, self-contained hand-off context (could another agent
pick this PR up cold from its description and linked issues alone), rollout and
deploy-safety framing, and shepherd or CI corrections already present in the
review history. Refresh the assessment with synchronous steering or check changes
made during triage, but do not wait for a newly dispatched asynchronous shepherd.
A useful recommendation must include the PR number, concrete evidence, verified
generator provenance, the exact source target to improve, one specific preventive
change, and a `recurring` or `one-off` tag.

Resolve generator provenance from machine-set labels and durable PR metadata. Map
`automation:scheduled` PRs to the exact file under `docs/prompts/scheduled/` named in the
PR body or run metadata, `automation:auto-fix` PRs to their automation prompt template,
and security auto-fix PRs to the producing triage skill. Recommend changes to
`agent-workflow`, another invoked skill, or shared tooling only when evidence shows
that source governed the weak behavior. If the exact source cannot be verified,
record the provenance as unknown and make no source-change recommendation.

Group repeated recommendations by root cause and pass the per-PR evidence and
deduplicated themes to the [retrospective](../retrospective/SKILL.md). Record `none`
when the generator produced an adequate PR. Keep this evaluation in the calling
triage flow; `ready-and-shepherd` remains a mechanical handoff.

### Automated Review Prompt

The verbatim prompt used by automated code review workflows lives in [`code-review-prompt.md`](code-review-prompt.md). It instructs the AI reviewer to ultrathink, scope reads to linked issues, the PR's own description, and workspace `CLAUDE.md` files, cover necessity/alternatives/correctness/security/performance/simplification/plan-adherence/requirement-coverage dimensions, and write findings to `code-review-payload.json`. The reviewer is purely advisory: it never approves, blocks, or is a required check. See the vouchington-tooling reusable
[`code-review.yml`](https://github.com/vouchington/vouchington-tooling/blob/main/.github/workflows/code-review.yml)
workflow; no workflow in this repository currently calls it.

For AI review:

- Request another review after additional commits when the reviewed code changed materially.
- Codex or Cursor reviews may be used as additional review surfaces, but they do not replace CI or human review. AI reviewer feedback is advisory and must yield to human intervention, the accepted plan, and linked GitHub issue requirements.
- If an external review check exposes no GitHub annotation, comment, review, or downloadable log, and its details URL requires sign-in, record that limitation in the PR notes and do not treat the opaque check as actionable code feedback.

### Suppressing bot-reviewer noise

When a bot produces non-actionable noise, add a permanent exception rather than triaging it by hand on every PR:

- **Non-actionable comments or reviews** → add a `ClassifyRule` file under `.pr-shepherd/classification/*.mts` matching the bot's raw and `[bot]`-suffixed `author` logins (and optionally `kind`/`body`), returning `{ suppress: true, autoResolve: true }`. See [`docs/configuration.md` in pr-shepherd](https://github.com/jonathanong/pr-shepherd/blob/main/docs/configuration.md) and the bundled examples under `examples/classification/`.
- **Noisy CI checks** → add a case-insensitive glob to `ignoreChecks` in `.pr-shepherdrc.yml` at the repo root.

Current exceptions:

- **coderabbit** — all comment/review kinds suppressed (`.pr-shepherd/classification/coderabbit.mts`); `CodeRabbit` CI check ignored.
- **kilo-code-bot** — "No Issues Found" PR comments suppressed (`.pr-shepherd/classification/kilo-no-issues.mts`); `Kilo Code Review` CI check ignored.
- **chatgpt-codex-connector** — non-actionable PR comments suppressed (`.pr-shepherd/classification/codex-rate-limit.mts`): quota notices whose copy matches `you have reached your (?:codex )?usage limits for \w+ reviews` (live "code reviews" and "security reviews" stems) or the legacy "usage limits have been reached" phrasing, and `## Codex Review Summary` / `<!-- codex-pull-request-review-summary -->` activity tables with no findings. Real `### Codex Review` summaries are not suppressed. There is no matching GitHub check name to add to `ignoreChecks`.
