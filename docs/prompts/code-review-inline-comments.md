# Code Review Batched Publishing Requirements

[vouchington/vouchington-tooling](https://github.com/vouchington/vouchington-tooling)'s
`code-review` composite action defaults `inline_prompt_path` to
this file — verified against `code-review.yml@93bad61` (v0.15.1) on 2026-09-09; re-verify against the pinned SHA
on each pin bump, since nothing in this repo enforces that the tooling default stays this path. The caller
appends it after the shared
[code-review-prompt.md](../../.agents/skills/agent-workflow/code-review-prompt.md) when building
its review prompt. No workflow in this repository currently calls that reusable workflow; the `code-review`
composite's poster validates the resulting `code-review-payload.json` against this contract.

- This section overrides how findings are published, and which review event is used.
- You have no MCP tool and no `gh` / `curl` / `node -e` publish path. Do not call `gh`, `curl`, or `node -e`. Do not post a GitHub review yourself. Write the complete review JSON to `code-review-payload.json` at the repository root with the Write tool. A separate trusted poster job posts exactly one review from that file after you exit.
- Collect every finding before writing the file. Write the file once. The file's `comments` array holds every inline finding, so GitHub creates exactly one review with many inline comments — not one review per comment. Do not write probe, test, or canary payloads.
- The only permitted way to build the review JSON is the Write tool to `code-review-payload.json`. Do not build the payload with `python3 -c`, `node -e`, `echo`, `cat`, `tee`, a shell heredoc, or any double-quoted shell string containing Markdown. Backtick-delimited identifiers, file paths, numbered findings, and `suggestion` fences must remain unchanged inside JSON string values.
- Regression guard: a review body mentioning identifiers such as `data-stores-primary.cjs`, `RateLimiterOptions`, `addPubSubMessageHandler`, `import-progress-pubsub.mts`, or `setValkeyErrorHandler(onError)` must keep those exact strings, including backticks, not empty blanks or concatenated plain text.
- The payload must include `"event": "COMMENT"`. The action ignores any other event and any `commit_id` you set. Do not submit `APPROVE` or `REQUEST_CHANGES` — final approval and blocking are reserved for human reviewers.
- If you find blocking issues (correctness, security, or plan-adherence blockers), describe them as inline comments in the COMMENT payload and explicitly label them as blocking (e.g. using **BLOCKING**); do not use `REQUEST_CHANGES`.
- Each `comments` entry needs `path`, `line`, `side` (`RIGHT` for an added/context line, `LEFT` for a removed line), and `body`. For a multi-line range, also add `start_line` and `start_side` — GitHub 422s the whole review if `start_line` is present without `start_side`. Place comments on lines that appear in a diff hunk (added, deleted, or hunk context). GitHub rejects comments that sit outside every hunk. The trusted poster remaps leftover out-of-hunk comments onto the nearest commentable line and prefixes `_Regarding path:originalLine (not in the diff hunk; posted on the nearest commentable line)._`; do not invent a different changed line to dodge that remap. Use `suggestion` code blocks for any concrete code change you'd recommend.
- The action posts once. The poster remaps comments onto commentable hunk lines first. If GitHub still 422s the inlines, it retries once as a body-only COMMENT that lists each remapped finding's file, line, and subject. Do not attempt to post or retry yourself.
- Give the review body a short top-level verdict — the detailed narrative summary is posted separately by the action's report step from your final message.
- Do not post praise-only inline comments. Cap inline comments to 15 per review and deduplicate to avoid GitHub secondary rate limits.
- Keep your final message terse — it is posted as the top-level summary comment by the action's report step. Do not repeat all inline findings in it; a short verdict with counts (e.g. "Wrote N inline findings. [summary sentence.]") is sufficient.
- If you have no findings, do not write `code-review-payload.json`.
- If you cannot determine the PR number or repository (e.g. a manual-dispatch run without PR event context), skip writing the file and say so in your final message.
