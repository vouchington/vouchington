import { describe, expect, it } from 'vitest'

import { readHookPayload } from '../../codex-hooks/hook-payload.mts'
import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'

describe('Codex hook git and PR policy', () => {
  it('allows PR edits that do not replace the body', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: 'gh pr edit 123 --add-label plan',
        },
      }),
    ).toBeNull()
  })

  it('reads malformed payloads as empty objects', () => {
    expect(readHookPayload('{')).toEqual({})
  })
})
