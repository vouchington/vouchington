# PR Description Helper

[Back to Dev Environment Reference](README.md#pr-description-helper)

`node dev/pr-description.mts <subcommand>` validates and manages PR bodies; prefer it over raw `gh pr create/edit --body-file`.
Diff-consuming commands reduce each unified-diff file block as it arrives, so large PRs do not require a whole-patch buffer.

- `validate [<pr>] [--body-file <path>]` — validates required PR sections, closing references, and the scheduled no-source exception. Body source: `--body-file` > stdin > `gh pr view <pr>`.
- `create --title <title> [--body-file <path>]` — validates and creates a draft PR; prints referenced issue state and related-issue hints. Body source: `--body-file` or stdin.
- `update <pr> [--body-file <path>]` — validates and replaces a PR body; prints referenced issue state. Body source: `--body-file` > stdin > `gh pr view`.

Every closing reference resolves its issue body and rejects unchecked rendered tasks. `validate <pr>` alone permits a closed issue when that exact merged PR is the latest closer; unchecked tasks still fail. Intentional exceptions require the exact reference-specific `related-issues-validation` allow comment.
The helper rejects bodies above GitHub's upstream-defined body limit before create/edit mutations,
reporting the Unicode-character count, UTF-8 byte count, and shared maximum. It preserves the input
exactly without truncating, normalizing, or compacting it automatically. Save the complete body and
preserve required content; move supporting detail to a linked issue or attachment, remove duplicate
prose, or compact only harmless Markdown whitespace before retrying.

The helper uses the shared Markdown parser to require exactly one visible, nonempty `## Summary`
and `## Impact`.
Prose, lists, and populated tables count; comments, code examples, images, summary labels, and
collapsed-only content do not. Headings inside `<details>` do not create or terminate visible
sections, and malformed details containers fail validation. Existing issue-reference and provenance
rules still apply. Closing and non-closing references and the scheduled/Fix Main exceptions use
the same Related issues section boundaries; supporting headings cannot truncate any of those paths.
Updates preserve the canonical Shepherd Journal exactly.

The helper enforces structure, not the truth of impact claims or the usefulness of diagrams.
Follow the [PR-description skill](../../../.agents/skills/pr-description/SKILL.md) for before/after,
audience, cost, schema, workflow diagrams, and conditional Harness gaps. Keep long supporting
details collapsed and material conclusions visible; routine passing local checks need no section.
