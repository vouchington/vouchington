import { DEFAULT_AUTOMATION_CONTEXT, type BlockDecision } from './core.mts'

import type { PreToolUseRuntime } from '../hook-payload.mts'

export type PreToolUseOptions = {
  /**
   * Which hook runtime is calling in, used only to choose how a 'confirm' disposition is
   * surfaced — it never affects the block/allow decision (that's automationContext). Omitted or
   * unrecognized is treated as Codex-style (emit empty on confirm) so a Claude-only
   * hookSpecificOutput payload is never sent to a non-Claude runtime.
   */
  runtime?: PreToolUseRuntime
  /** See GitHubWorkflowPolicyOptions.automationContext in policy/github-closing-refs.mts. */
  automationContext?: boolean
  /** See GitHubWorkflowPolicyOptions.sessionOwners in policy/github-closing-refs.mts. */
  sessionOwners?: () => ReadonlySet<string> | undefined
}

/**
 * Renders a `disposition: 'confirm'` BlockDecision into this hook call's stdout output — the only
 * place that decides between a silent 'allow', a hard block, or (for Codex) no output at all.
 * Extracted out of policy.mts to keep that file under the source line cap.
 */
export function renderConfirmDisposition(block: BlockDecision, options: PreToolUseOptions): string {
  if (options.runtime !== 'claude') {
    // Codex (and any unrecognized runtime) has no forceable prompt in this hook protocol — emit
    // nothing and defer to Codex's own approval system. This is best-effort, not guaranteed: a
    // session started with a looser approval_policy opts out of the native prompt too. See
    // docs/development/merge-authority.md.
    return ''
  }

  if (options.automationContext ?? DEFAULT_AUTOMATION_CONTEXT) {
    // Unreachable in practice — every merge branch returns disposition:'block' (not 'confirm')
    // once automationContext is true (see github-workflow.mts, github-stack-workflow.mts,
    // github-api-merge-options.mts). Kept as belt-and-suspenders so a future refactor can't
    // silently let CI merge without a human decision.
    return JSON.stringify({ decision: 'block', reason: block.reason })
  }

  // Interactive session: the human already made the merge decision by asking for it in their own
  // message. A second, tool-level confirmation click on top of that is a redundant gate — see
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
