import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'

describe('Codex hook gh stack help policy', () => {
  it.each([
    'gh stack --help',
    'gh stack -h',
    'gh stack help',
    'gh stack checkout --help',
    'gh stack submit -h',
    'gh stack init --help',
  ])('allows help that runs no command, even in automation: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })).toBeNull()
  })

  // The coarse automation merge rule does not parse help flags: merge help is an accepted overmatch.
  it.each([
    'gh stack help merge',
    'gh stack merge --help',
    'gh-stack merge --help',
    'gh extension exec stack merge --help',
  ])('blocks merge help in automation and allows it interactively: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain(
      'never delegated to an agent',
    )
    expect(
      findPreToolUseBlock({ tool_input: { command } }, { automationContext: false }),
    ).toBeNull()
  })

  it.each([
    ['gh stack merge 12 --help', 'never delegated to an agent'],
    ['gh stack merge -- --help', 'PR-number selector'],
    ['gh stack merge --help=true', 'PR-number selector'],
    ['gh stack submit --help --open', 'opened as draft first'],
    ['gh stack checkout --help 7', 'exactly one stack number'],
    ['gh stack --help merge', 'gh stack allowlist is closed'],
    ['gh stack help merge 12', 'gh stack allowlist is closed'],
    ['gh stack help modify', 'gh stack allowlist is closed'],
    ['gh stack modify --help', 'gh stack allowlist is closed'],
  ])('applies the command policy when help comes with anything else: %s', (command, reason) => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain(reason)
  })
})
