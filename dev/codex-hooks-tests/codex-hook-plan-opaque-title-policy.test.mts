import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock } from '../codex-hooks/policy.mts'

describe('Codex hook opaque issue title policy', () => {
  it.each([
    'gh issue create --body-file issue.md',
    'gh issue create --title "$TITLE" --body-file issue.md',
    'gh issue create --title "$TITLE suffix" --body-file issue.md',
    'gh issue create --title P* --body-file issue.md',
    'gh issue create --title P{l..l}an:X --body-file issue.md',
    "bash -c 'gh issue create --title \"$1\" --body-file plan.md' _ 'Plan: X'",
    "bash -c 'gh issue create --title \"$@\" --body-file plan.md' _ 'Plan: X'",
    'gh issue create --title "$(node title.mjs)" --body-file issue.md',
    'gh issue create --title "`node title.mjs`" --body-file issue.md',
  ])('blocks an absent or opaque raw issue title: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain(
      'literal non-Plan title',
    )
  })

  it('allows a literal non-Plan raw issue title', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: 'gh issue create --title "Bug: literal title" --body-file issue.md',
        },
      }),
    ).toBeNull()
  })

  it.each([
    "gh issue create --title 'Document $API_KEY behavior' --body-file issue.md",
    "gh issue create --title 'Plan $API_KEY behavior' --body-file issue.md",
    'gh issue create --title "Document \\$API_KEY behavior" --body-file issue.md',
    "gh issue create --title 'Document `code` behavior' --body-file issue.md",
    "gh issue create --title 'P* documentation' --body-file issue.md",
    "gh issue create --title 'P{l..l} documentation' --body-file issue.md",
  ])('allows shell-quoted or escaped literal notation: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })).toBeNull()
  })

  it('does not let an unrelated literal decoy hide the expandable title argument', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command:
            "TITLE='Plan: X'; echo '$TITLE'; gh issue create --title \"$TITLE\" --body-file plan.md",
        },
      })?.reason,
    ).toContain('literal non-Plan title')
  })
})
