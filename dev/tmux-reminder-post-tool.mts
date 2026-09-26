import { spawnSync } from 'node:child_process'

import { isRecord } from './codex-hooks/policy/core.mts'
import { extractToolCommand, hookToolName } from './codex-hooks/hook-payload.mts'
import type { HookPayload } from './codex-hooks/types.mts'

// Ported from dev/tmux-agent-reminder's bash `post-tool` case (jq + grep) so Claude and Codex
// share one implementation instead of a duplicated bash/TypeScript pair. Same policy string as
// the bash script's SessionStart/user-prompt cases, referenced by name only here.
const PR_CREATE_COMMAND_PATTERN = /(^|[;&|])\s*gh\s+pr\s+create(\s|$)/
const GIT_PUSH_COMMAND_PATTERN = /(^|[;&|])\s*git\s+push(\s|$)/
const RESET_WORKTREE_INVOCATION_PATTERN =
  /(^|[;&|])\s*(\.\/)?dev\/reset-worktree(?:\s+(--help|-h))?(?=[;&|]|\s|$)/g
const PR_SUFFIX_PATTERN = /-pr\d+$/

// Scans every dev/reset-worktree invocation in the command separately rather than
// exempting the whole string when any one of them is --help/-h: a compound command
// like `./dev/reset-worktree --help; ./dev/reset-worktree --force` runs a real
// reset too, and a whole-string help check would wrongly suppress the reminder for it.
function hasNonHelpResetWorktreeInvocation(command: string): boolean {
  const pattern = new RegExp(RESET_WORKTREE_INVOCATION_PATTERN.source, 'g')
  let match: RegExpExecArray | null
  while ((match = pattern.exec(command)) !== null) {
    if (match[3] === undefined) return true
  }
  return false
}

function paneTitle(tmuxPane: string): string {
  const result = spawnSync('tmux', ['display-message', '-p', '-t', tmuxPane, '#{pane_title}'], {
    encoding: 'utf8',
  })
  if (result.status !== 0) return ''
  return result.stdout.trim()
}

// The bash `post-tool` case gated its whole Bash/Shell/run_terminal_command branch on
// `jq -r '.tool_response.exit_code // .toolResult.exit_code // 0'` — checking Grok's
// `toolResult.exit_code` shape as a fallback alongside `tool_response.exit_code`. Claude's
// `tool_response` object and Codex's merged-output string never carry an exit code, so this stays
// a no-op for both (mirrors the bash default of 0 when the field is absent). Cursor's payload
// (normalized from `Shell`/`tool_output` in readHookPayload) and Grok's own `run_terminal_command`
// payload are the two shapes that provide a real exit code — for those runtimes this restores the
// original gate exactly, so a failed `gh pr create`/`git push` no longer reminds on a stale `->`
// line.
function toolExitCode(payload: HookPayload): number | undefined {
  for (const raw of [payload.tool_response, payload.toolResponse, payload.toolResult]) {
    if (isRecord(raw) && typeof raw.exit_code === 'number') return raw.exit_code
  }
  return undefined
}

// Reminds the agent to (re)name its tmux window at the checkpoints a bare post-tool payload can
// actually detect: a plan just got accepted, a PR just got created, a push landed but the window
// title has no `-pr<N>` suffix yet, or reset-worktree ran but left a stale title behind. Silent
// (`null`) outside tmux and for every other tool call — mirrors the bash script's laziness, only
// running `tmux display-message` inside the branches that need the current title.
export function renderPostToolReminder(payload: HookPayload, tmuxPane: string): string | null {
  if (tmuxPane === '') return null

  const toolName = hookToolName(payload)

  if (toolName === 'ExitPlanMode') {
    return '[tmux-window-name] Plan accepted — refine window name if scope shifted. ./dev/tmux-name <name>  (dangerouslyDisableSandbox: true)'
  }

  if (toolName !== 'Bash' && toolName !== 'run_terminal_command') {
    return null
  }

  const command = extractToolCommand(payload)
  if (command === '') return null

  const exitCode = toolExitCode(payload)
  if (exitCode !== undefined && exitCode !== 0) return null

  if (PR_CREATE_COMMAND_PATTERN.test(command)) {
    return '[tmux-window-name] PR created — add the -pr<N> suffix: ./dev/tmux-name <feature-pr123>  (dangerouslyDisableSandbox: true)'
  }

  if (GIT_PUSH_COMMAND_PATTERN.test(command)) {
    const title = paneTitle(tmuxPane)
    if (!PR_SUFFIX_PATTERN.test(title)) {
      return '[tmux-window-name] git push on PR branch — confirm -pr<N> suffix is set: ./dev/tmux-name <feature-pr123>  (dangerouslyDisableSandbox: true)'
    }
    return null
  }

  // --help/-h exits before reset-worktree touches the pane title (or anything else), so it
  // never leaves a stale title behind -- don't remind for it.
  if (hasNonHelpResetWorktreeInvocation(command)) {
    const title = paneTitle(tmuxPane)
    if (title !== '') {
      return '[tmux-window-name] reset-worktree ran — pane title should be empty. ./dev/tmux-name ""  (dangerouslyDisableSandbox: true)'
    }
    return null
  }

  return null
}
