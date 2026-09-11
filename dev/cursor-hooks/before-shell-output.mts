import {
  extractToolCommand,
  findPreToolUseBlock,
  type PreToolUseOptions,
} from '../codex-hooks/policy.mts'
import { DEFAULT_AUTOMATION_CONTEXT } from '../codex-hooks/policy/core.mts'
import type { HookPayload } from '../codex-hooks/types.mts'

export function cursorBeforeShellOutput(
  payload: HookPayload,
  options: PreToolUseOptions = {},
): string {
  if (extractToolCommand(payload) === '') {
    return JSON.stringify({
      permission: 'deny',
      user_message:
        'Cursor beforeShellExecution payload is missing a command; fail closed instead of allowing.',
      agent_message:
        'Cursor beforeShellExecution payload is missing a command; fail closed instead of allowing.',
    })
  }

  const block = findPreToolUseBlock(payload, {
    validateClosingIssueReferences: true,
    automationContext: options.automationContext,
  })
  if (block === null) {
    return JSON.stringify({ permission: 'allow' })
  }

  if (block.disposition === 'confirm') {
    if (options.automationContext ?? DEFAULT_AUTOMATION_CONTEXT) {
      // Unreachable in practice — every merge branch returns disposition:'block' (not 'confirm')
      // once automationContext is true. Kept as belt-and-suspenders, mirroring
      // codex-hooks/policy/pre-tool-use-confirm-output.mts's renderConfirmDisposition.
      return JSON.stringify({
        permission: 'deny',
        user_message: block.reason,
        agent_message: block.reason,
      })
    }
    // Interactive session: the human already made the merge decision by asking for it in their
    // own message. See docs/development/merge-authority.md.
    return JSON.stringify({
      permission: 'allow',
      agent_message:
        'Interactive merge: proceeding on the human decision already made in this session. See docs/development/merge-authority.md.',
    })
  }

  return JSON.stringify({
    permission: 'deny',
    user_message: block.reason,
    agent_message: block.reason,
  })
}
