import { describe, expect, it } from 'vitest'
import { findPreToolUseBlock } from '../codex-hooks/policy.mts'

describe('Codex hook Claire path policy', () => {
  it('blocks accidental .claire paths in tool payloads', () => {
    expect(
      findPreToolUseBlock({
        tool_input: { command: 'sed -n 1,20p .claire/settings.json' },
      })?.reason,
    ).toContain('.claude')
  })

  it.each(['cd .claire', 'ls .claire', 'find docs/.claire -type f'])(
    'blocks accidental .claire directory path: %s',
    command => {
      expect(
        findPreToolUseBlock({
          tool_input: { command },
        })?.reason,
      ).toContain('.claude')
    },
  )

  it('allows .claire typo text in non-path command content', () => {
    expect(
      findPreToolUseBlock({
        tool_input: { command: 'printf ".claire is a typo" > docs.md' },
      }),
    ).toBeNull()
  })

  it('blocks accidental .claire paths in patch tool path fields', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: '*** Begin Patch\n*** Update File: docs/README.md\n*** End Patch',
          edits: [{ file_path: '.claire/settings.json' }],
        },
      })?.reason,
    ).toContain('.claude')
  })

  it('blocks accidental .claire paths in patch headers', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: '*** Begin Patch\n*** Update File: .claire/settings.json\n*** End Patch',
        },
      })?.reason,
    ).toContain('.claude')
  })

  it('ignores accidental .claire text in patch content', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command:
            '*** Begin Patch\n*** Update File: docs/README.md\n+Mention .claire as a typo example\n*** End Patch',
        },
      }),
    ).toBeNull()
  })
})
