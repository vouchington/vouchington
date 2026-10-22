import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'

describe('Codex hook gh policies behind a modeled wrapper chain', () => {
  it.each([
    'env -C /tmp gh pr create --title t --body "Closes #1"',
    'nohup env -u GH_TOKEN gh pr create --title t --body "Closes #1"',
  ])('allows raw PR creation behind a wrapper: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })).toBeNull()
  })
})
