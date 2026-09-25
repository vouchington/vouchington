import { extractToolCommand } from '../codex-hooks/hook-payload.mts'
import { findPreToolUseBlock, type PreToolUseOptions } from '../codex-hooks/policy.mts'
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
    // Only an attended Claude session gets the silent merge allow; Cursor has no attended signal,
    // so its own approval prompt decides. See docs/development/merge-authority.md.
    return JSON.stringify({
      permission: 'ask',
      user_message: block.reason,
      agent_message: block.reason,
    })
  }

  return JSON.stringify({
    permission: 'deny',
    user_message: block.reason,
    agent_message: block.reason,
  })
}
