---
name: agent-workflow
description: |
  Shared workflow rules for Claude Code, Codex, Grok, Cursor, and OpenCode agents. Load before starting
  any implementation task: worktree setup, planning, coding, testing, code review,
  before-push commands, git, and PR conventions.
---

# Filaments Agent Workflow Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:agent-workflow`; Grok, Cursor, and OpenCode read `node_modules/vouchington-tooling/skills/agent-workflow/SKILL.md` and resolve its supporting resources relative to that directory. If it cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

The remaining rules are Filaments-only SDLC and safety policy.

This is the shared workflow for Claude Code, Codex, Grok, Cursor, and OpenCode agents working in this repository. It is referenced from [`.husky/CLAUDE.md`](../../../.husky/CLAUDE.md). Codex, Grok, and Cursor read checked-in `CLAUDE.md` files; do not add generated `AGENTS.md` copies of repo or workspace agent instructions. See [agent-harness-parity.md](../../../docs/development/agent-harness-parity.md).

Related local instructions:

- Root entrypoint: [CLAUDE.md](../../../CLAUDE.md)
- Cursor CLI config: [`.cursor/README.md`](../../../.cursor/README.md)
- Worktree and local services: [dev/CLAUDE.md](../../../dev/CLAUDE.md)
- Before-push commands: [before-pushing.md](before-pushing.md)
- Git hooks: [`.husky/CLAUDE.md`](../../../.husky/CLAUDE.md)
- Documentation index: [docs/README.md](../../../docs/README.md)
- Planning artifact and schema: [planning skill](../planning/SKILL.md)

## AI Coding Assistants

**Allowed (with privacy mode enabled):**

- Cursor
- Codex
- Claude Code
- Grok — enable `/privacy` coding-data and training opt-out
- OpenCode — first-class local harness; skills from `.agents/skills`; no copied hooks. Local models via `/connect`.

**Disallowed:**

- Google Gemini — does not support privacy mode for personal accounts.
- Z.AI — does not support privacy mode except for enterprise accounts.

**Accepted CI exception:** OpenCode Zen PR reviews (`opencode/muse-spark-1.3-contributor-free`) may send prompts and completions to train future Meta models, per OpenCode Zen privacy docs. That exception is only for the advisory CI reviewer; it does not authorize Gemini or other disallowed local assistants.

This repository keeps agent instructions in checked-in `CLAUDE.md` files. Codex reads those files through `project_doc_fallback_filenames = ["CLAUDE.md"]` in [.codex/config.toml](../../../.codex/config.toml). Grok and Cursor load `CLAUDE.md` natively. Do not add tracked generated `AGENTS.md` copies of repo or workspace agent instructions; `CLAUDE.md` is the shared project-instruction source for Claude, Codex, Grok, and Cursor.

## Feedback And Decision Hierarchy

- When instructions, reviews, or artifacts conflict, resolve decisions in this order: human intervention, accepted plan, GitHub issues, then AI reviewers.
- Human intervention means explicit human direction in chat, GitHub comments, GitHub reviews, or shepherd-mediated instructions. It overrides the accepted plan, linked issues, and AI reviewer feedback unless the human says otherwise.
- The accepted plan is the next source of truth. If implementation direction, scope, or validation changes after plan acceptance, record what changed and why before continuing.
- GitHub issues are authoritative for unresolved requirements not superseded by human direction or the accepted plan text, which is often recorded in a `Plan:` issue. Treat other linked source issues and follow-up issues as part of the decision record, below the accepted plan.
- AI reviewers are advisory. Use their feedback when it improves the PR without conflicting with higher-priority sources, and escalate instead of applying AI reviewer feedback that contradicts human direction, the accepted plan, or linked issue requirements.
- When making a material implementation, scope, validation, or review-resolution decision, comment on the accepted plan issue if one exists. If the PR is under `pr-shepherd`, also record the decision in the shepherd journal when applicable. If neither record exists yet, capture the decision in the saved plan or PR notes once that artifact is created.
- Long-running pr-shepherd sessions run until pr-shepherd itself reaches `CANCEL` or `ESCALATE`, per the termination contract and stop/re-arm rules in [Git And PRs](git-and-prs.md). Do not turn session hooks, repeated CLI ticks, or follow-up issues into implicit authorization to keep polling a blocker that pr-shepherd has not escalated.
- Before absorbing a newly discovered blocker, reproduce it against refreshed `origin/main` and search for an existing fix or issue. If an existing fix resolves the blocker, use and retest it. Otherwise, whether or not an issue exists, ask whether to widen the accepted scope or only link or record a follow-up. Filing an issue records work but does not amend the accepted plan or authorize implementation.

## Sub-docs

Load the relevant sub-doc for each phase of work:

| Phase                                                        | Sub-doc                                      |
| ------------------------------------------------------------ | -------------------------------------------- |
| Start of work and discovery lifecycle                        | [start-of-work.md](start-of-work.md)         |
| Plan artifact, schema, and Plan issue                        | [planning skill](../planning/SKILL.md)       |
| Implementation, testing, static-analysis, repo-wide commands | [implementation.md](implementation.md)       |
| Code review                                                  | [code-review.md](code-review.md)             |
| Before pushing, cheap local commands                         | [before-pushing.md](before-pushing.md)       |
| Git, PRs, Codex workflow, session close-out                  | [git-and-prs.md](git-and-prs.md)             |
| Native GitHub stack CLI mechanics                            | [stacked-prs skill](../stacked-prs/SKILL.md) |
