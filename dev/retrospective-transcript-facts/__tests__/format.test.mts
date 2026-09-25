import { describe, expect, it } from 'vitest'

import type { TranscriptFacts } from '../compute-shared.mts'
import { formatTranscriptFacts, formatUnavailable } from '../format.mts'

describe('formatTranscriptFacts', () => {
  it('prints the compaction count', () => {
    const output = formatTranscriptFacts('session', {
      userPrompts: 0,
      assistantResponses: 0,
      toolCalls: 0,
      failedToolCalls: 0,
      noMistakesInvocations: 0,
      advisorCalls: 0,
      pushCommandAttempts: 0,
      compactions: 2,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
      subagentToolCalls: 0,
      subagentTokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
    })
    expect(output).toContain('Compactions: 2')
  })

  it('renders every field into the paste-ready block', () => {
    const facts: TranscriptFacts = {
      userPrompts: 3,
      assistantResponses: 5,
      toolCalls: 12,
      failedToolCalls: 1,
      noMistakesInvocations: 2,
      advisorCalls: 1,
      pushCommandAttempts: 4,
      compactions: 2,
      tokens: { input: 100, output: 200, cacheRead: 300, cacheCreation: 400 },
      subagentToolCalls: 6,
      subagentTokens: { input: 10, output: 20, cacheRead: 30, cacheCreation: 40 },
    }

    expect(formatTranscriptFacts('abc-123', facts)).toBe(
      [
        '=== Transcript Facts ===',
        'Session: abc-123',
        'User prompts: 3',
        'Assistant responses: 5',
        'Tool calls: 12 (failed: 1)',
        'no-mistakes invocations: 2',
        'advisor calls: 1',
        'Push commands attempted: 4',
        'Compactions: 2',
        'Tokens: input=100 output=200 cache_read=300 cache_creation=400',
        'Subagent tool calls: 6',
        'Subagent tokens: input=10 output=20 cache_read=30 cache_creation=40',
        '',
      ].join('\n'),
    )
  })
})

describe('formatUnavailable', () => {
  it('renders the header with a status reason and exits successfully by contract', () => {
    expect(formatUnavailable('no session id')).toBe(
      ['=== Transcript Facts ===', 'Status: unavailable (no session id)', ''].join('\n'),
    )
  })
})
