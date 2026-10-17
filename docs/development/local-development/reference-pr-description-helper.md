# PR Description Policy

[Back to Dev Environment Reference](README.md#pr-description-helper)

The `pr_validate`, `pr_create`, and `pr_update` tools of the `vouchington-tooling` MCP server validate and manage PR bodies; raw `gh pr create` and `gh pr edit --body*` are blocked by the Codex hook. The tools render the body (`## Summary`, `## Impact`, `## Related issues`, `## Details`, then the provenance lines) and call this checkout's policy module, [`dev/agent-policy.mts`](../../../dev/agent-policy.mts) (`validatePullRequest`, `pullRequestDefaults`), declared under `vouchington-tooling.policy` in `package.json`.
Diff-consuming checks reduce each unified-diff file block as it arrives, so large PRs do not require a whole-patch buffer.

- `pr_validate` — validates required PR sections, issue references, and supported non-closing representations; with a PR number it also audits the live PR (milestone and project completion, closure provenance, supersession).
- `pr_create` — validates and creates a draft PR; the policy reports referenced issue state and supplies the milestone, project, and repository defaults inherited from the related issues.
- `pr_update` — validates and replaces a PR body, preserving the canonical Shepherd Journal.

Every closing reference resolves its issue body and rejects unchecked rendered tasks. `validate <pr>` alone permits a closed issue when that exact merged PR is the latest closer; unchecked tasks still fail. Intentional exceptions require the exact reference-specific `related-issues-validation` allow comment.
The policy rejects bodies above GitHub's upstream-defined body limit before create/edit mutations,
reporting the Unicode-character count, UTF-8 byte count, and shared maximum. It preserves the input
exactly without truncating, normalizing, or compacting it automatically. Save the complete body and
preserve required content; move supporting detail to a linked issue or attachment, remove duplicate
prose, or compact only harmless Markdown whitespace before retrying.

The policy uses the shared Markdown parser to require exactly one visible, nonempty `## Summary`
and `## Impact`.
Prose, lists, and populated tables count; comments, code examples, images, summary labels, and
collapsed-only content do not. Headings inside `<details>` do not create or terminate visible
sections, and malformed details containers fail validation. Existing issue-reference and provenance
rules still apply. Closing and non-closing references and the no-source and partial-batch exceptions use
the same Related issues section boundaries; supporting headings cannot truncate any of those paths.
Updates preserve the canonical Shepherd Journal exactly.

An incomplete batch of a larger source issue passes its source as the only `relatedIssues` entry,
with `relation: "refs"`, plus `noSourceIssue: { reason: "partial batch" }`. The tools render the
reference directly above the exact declaration in `## Related issues`:

```markdown
- Refs #123 — Batch plan; later batches finish it.
  Partial batch; source issue remains open for remaining work.

<!-- related-issues-validation: partial-batch -->
```

Explain the completed batch and remaining work in the body. The policy resolves the referenced
source as an existing open issue, rejects pull requests, and permits its unfinished tasks because
the batch does not claim completion. It does not treat that reference as an issue closed by the
PR; all other closing references retain their existing checks. Historical validation of an already
merged batch permits the source issue to have closed later. Required sections, provenance, and
draft-first creation still apply. The completing batch uses a truthful closing reference instead.

The policy enforces structure, not the truth of impact claims or the usefulness of diagrams.
Follow the [PR-description skill](../../../.agents/skills/pr-description/SKILL.md) for before/after,
audience, cost, schema, workflow diagrams, and conditional Harness gaps. Keep long supporting
details collapsed and material conclusions visible; routine passing local checks need no section.
