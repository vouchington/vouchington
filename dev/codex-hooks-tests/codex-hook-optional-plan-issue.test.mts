import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock } from '../codex-hooks/policy.mts'

describe('optional Plan issues use ordinary issue creation', () => {
  it.each([
    'gh issue create --title "Plan: Optional record" --body "A proportional plan"',
    'gh -R owner/repo issue create -t"Plan: Optional record" --body-file plan.md',
    'gh issue create --title "$TITLE" --body-file "$BODY_FILE"',
  ])('does not apply the retired schema gate: %s', command => {
    expect(
      findPreToolUseBlock({ tool_input: { command } }, { automationContext: false }),
    ).toBeNull()
  })
})
