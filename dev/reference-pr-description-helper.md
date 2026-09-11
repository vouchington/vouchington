# PR Description Helper

[Back to Dev Environment Reference](README.md#pr-description-helper)

`node dev/pr-description.mts <subcommand>` validates and manages PR bodies; prefer it over raw `gh pr create/edit --body-file`.

- `validate [<pr>] [--body-file <path>]` — validates required PR sections, closing references, and the scheduled no-source exception. Body source: `--body-file` > stdin > `gh pr view <pr>`.
- `create --title <title> [--body-file <path>]` — validates and creates a draft PR; prints referenced issue state and related-issue hints. Body source: `--body-file` or stdin.
- `update <pr> [--body-file <path>]` — validates and replaces a PR body; prints referenced issue state. Body source: `--body-file` > stdin > `gh pr view`.

Every closing reference resolves its issue body and rejects unchecked rendered tasks. `validate <pr>` alone permits a closed issue when that exact merged PR is the latest closer; unchecked tasks still fail. Intentional exceptions require the exact reference-specific `related-issues-validation` allow comment.
The helper rejects bodies above GitHub's upstream-defined body limit before create/edit mutations,
reporting the Unicode-character count, UTF-8 byte count, and shared maximum. It preserves the input
exactly without truncating, normalizing, or compacting it automatically. Save the complete body and
preserve required content; move supporting detail to a linked issue or attachment, remove duplicate
prose, or compact only harmless Markdown whitespace before retrying.
