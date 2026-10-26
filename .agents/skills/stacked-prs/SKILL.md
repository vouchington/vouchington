---
name: stacked-prs
description: Discover and shepherd native GitHub PR stacks or PRs based on non-main branches.
---

# Vouchington Stacked PR Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:stacked-prs`; Grok, Cursor, and OpenCode read
`node_modules/vouchington-tooling/skills/stacked-prs/SKILL.md` and its referenced procedures.
If neither source is readable, report the missing prerequisite; never apply this overlay alone.
Do not reload a canonical skill or adapter already read.

## Vouchington additions

[Git And PRs](../agent-workflow/git-and-prs.md) decides when work must stack, sets the ten-layer
cap, and requires one source issue per PR. `main` is the default branch. Use the native `gh stack`
commands from the canonical [gh-stack mechanics](../../../node_modules/vouchington-tooling/skills/stacked-prs/references/gh-stack.md).
The published pre-tool-use policy enforces the local command allowlist via
`dev/codex-hooks/policy/stack-policy.mts` and rejects an off-trunk root. Area workflows must not filter `pull_request`
branches: submission creates mid-stack PRs before GitHub registers the stack.

After `gh stack submit --auto`, update each draft with the `vouchington-tooling` MCP `pr_update`
tool from that layer's worktree. The `Agent:` line stamped by `pr_create` or `pr_update` supplies
the session ownership signal in the canonical [drain procedure](../../../node_modules/vouchington-tooling/skills/stacked-prs/references/drain.md).
The parent does not run another shepherd poll for the same stack. Run
`pnpm exec pr-shepherd stack <pr> --until-terminal --quiet-status` for the owned stack, following
the printed instructions. A fix on a lower layer uses `./dev/rebase-onto-main --stack` or the
appropriate canonical `gh stack` operation; serialize Git mutations in its one worktree.

### Who runs the stack

Use the canonical ownership and worker rules. A Vouchington layer reaches decent shape after its
before-push checks pass; the parent never runs the stack shepherd. When the session hands off a
stack, follow [Close-out](../agent-workflow/git-and-prs.md#close-out).

### Upper-only fast-forward

Follow the canonical [upper-only fast-forward](../../../node_modules/vouchington-tooling/skills/stacked-prs/references/drain.md#upper-only-fast-forward)
check and [Before Pushing](../agent-workflow/before-pushing.md) while a lower layer is queued.

### Merge every ready bottom layer at once

Only an explicit human approval permits a merge, and it must cover every layer the command lands.
Follow the canonical [merge checks](../../../node_modules/vouchington-tooling/skills/stacked-prs/references/drain.md#merge-the-whole-stack)
before `gh stack merge <target> --yes --squash`; `--squash` is Vouchington's strategy. The
`needs-human` label and one PR comment per escalation event carry a blocked handoff; clear the
label when resolved. Never merge or enqueue from a shepherd result alone.
