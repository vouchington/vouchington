import type { PreToolUseRuntime } from '../hook-payload.mts'

export type PreToolUseOptions = {
  /**
   * Which hook runtime is calling in, used only to choose how a 'confirm' disposition is
   * surfaced — it never affects the block/allow decision (that's automationContext). Omitted or
   * unrecognized is treated as Codex-style (emit empty on confirm) so a Claude-only
   * hookSpecificOutput payload is never sent to a non-Claude runtime.
   */
  runtime?: PreToolUseRuntime
  /**
   * True only when Claude Code marked this session attended — see isAttendedClaudeSession in
   * policy.mts. Omitted means unattended, so no silent allow is ever emitted.
   */
  attended?: boolean
  /** See GitHubWorkflowPolicyOptions.automationContext in policy/github-closing-refs.mts. */
  automationContext?: boolean
  /** See GitHubWorkflowPolicyOptions.sessionOwners in policy/github-closing-refs.mts. */
  sessionOwners?: () => ReadonlySet<string> | undefined
}

/**
 * Renders a `disposition: 'confirm'` BlockDecision (an interactive lone merge) into this hook
 * call's stdout output. Extracted out of policy.mts to keep that file under the source line cap.
 */
export function renderConfirmDisposition(options: PreToolUseOptions): string {
  if (options.runtime !== 'claude' || options.attended !== true) {
    // Codex, Grok, and an unattended Claude session (claude -p, Auto Harness) get no opinion from
    // the hook, so the harness's own prompt, approval policy, or auto-mode classifier decides.
    // See docs/development/merge-authority.md.
    return ''
  }

  // Attended Claude session: the human already made the merge decision by asking for it in their
  // own message. A second, tool-level confirmation click on top of that is a redundant gate — see
  // docs/development/merge-authority.md.
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason:
        'Interactive merge: proceeding on the human decision already made in this session. See docs/development/merge-authority.md.',
    },
  })
}
