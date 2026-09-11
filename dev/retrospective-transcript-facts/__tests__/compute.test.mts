import { describe, expect, it } from 'vitest'

import { computeTranscriptFacts } from '../compute.mts'

function line(record: unknown): string {
  return JSON.stringify(record)
}

function assistantUsage(usage: Record<string, number>) {
  return line({ type: 'assistant', isSidechain: false, message: { content: [], usage } })
}

describe('computeTranscriptFacts', () => {
  it('returns all-zero facts for empty input', () => {
    expect(computeTranscriptFacts([])).toEqual({
      userPrompts: 0,
      assistantResponses: 0,
      toolCalls: 0,
      failedToolCalls: 0,
      noMistakesInvocations: 0,
      advisorCalls: 0,
      pushCommandAttempts: 0,
      compactions: 0,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
      subagentToolCalls: 0,
      subagentTokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
    })
  })

  it('skips blank and malformed lines without throwing', () => {
    const facts = computeTranscriptFacts(['', '   ', '{not json', '[1,2,3]', 'null', '"a string"'])
    expect(facts.userPrompts).toBe(0)
    expect(facts.toolCalls).toBe(0)
  })

  it('counts a real string-content user prompt but not isMeta wrapper text', () => {
    const facts = computeTranscriptFacts([
      line({ type: 'user', message: { content: 'do the thing' } }),
      line({ type: 'user', isMeta: true, message: { content: '<local-command-caveat>...' } }),
      line({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'x' }] } }),
    ])
    expect(facts.userPrompts).toBe(1)
  })

  it('counts main-session Claude compact summary user records as compactions', () => {
    const facts = computeTranscriptFacts([
      line({ type: 'user', isCompactSummary: true, message: { content: [] } }),
      line({
        type: 'user',
        isSidechain: true,
        isCompactSummary: true,
        message: { content: [] },
      }),
      line({ type: 'user', isCompactSummary: false, message: { content: [] } }),
    ])
    expect(facts.compactions).toBe(1)
  })

  it('counts assistant responses and sums usage tokens across records', () => {
    const facts = computeTranscriptFacts([
      assistantUsage({
        input_tokens: 2,
        output_tokens: 788,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 51593,
      }),
      assistantUsage({
        input_tokens: 10,
        output_tokens: 20,
        cache_read_input_tokens: 5,
        cache_creation_input_tokens: 0,
      }),
    ])
    expect(facts.assistantResponses).toBe(2)
    expect(facts.tokens).toEqual({ input: 12, output: 808, cacheRead: 5, cacheCreation: 51593 })
  })

  it('treats missing or non-numeric usage fields as zero', () => {
    const facts = computeTranscriptFacts([
      line({ type: 'assistant', message: { content: [] } }),
      line({ type: 'assistant', message: { content: [], usage: { input_tokens: 'oops' } } }),
    ])
    expect(facts.assistantResponses).toBe(2)
    expect(facts.tokens).toEqual({ input: 0, output: 0, cacheRead: 0, cacheCreation: 0 })
  })

  it('counts tool_use and server_tool_use blocks as tool calls, and is_error tool_result as failed', () => {
    const facts = computeTranscriptFacts([
      line({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 'a', name: 'Read', input: {} },
            { type: 'server_tool_use', id: 'b', name: 'web_search', input: {} },
          ],
        },
      }),
      line({
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'a', is_error: true, content: 'boom' },
            { type: 'tool_result', tool_use_id: 'b', is_error: false, content: 'ok' },
          ],
        },
      }),
    ])
    expect(facts.toolCalls).toBe(2)
    expect(facts.failedToolCalls).toBe(1)
  })

  it('wires Bash tool_use commands through to noMistakesInvocations/pushCommandAttempts, tolerating a lowercase tool name and extra whitespace', () => {
    const facts = computeTranscriptFacts([
      line({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 'a', name: 'Bash', input: { command: 'pnpm run no-mistakes' } },
            {
              type: 'tool_use',
              id: 'b',
              name: 'bash',
              input: { command: 'git  push -u origin foo' },
            },
            { type: 'tool_use', id: 'c', name: 'Bash', input: { command: 'gh pr create' } },
          ],
        },
      }),
    ])
    expect(facts.noMistakesInvocations).toBe(1)
    expect(facts.pushCommandAttempts).toBe(1)
  })

  it('ignores Bash tool_use blocks with a non-string command', () => {
    const facts = computeTranscriptFacts([
      line({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: 'a', name: 'Bash', input: {} }] },
      }),
    ])
    expect(facts.noMistakesInvocations).toBe(0)
    expect(facts.pushCommandAttempts).toBe(0)
  })

  it('dedupes an advisor call across its server_tool_use call and advisor_tool_result blocks', () => {
    const facts = computeTranscriptFacts([
      line({
        type: 'assistant',
        message: { content: [{ type: 'server_tool_use', id: 'srv1', name: 'advisor', input: {} }] },
      }),
      line({
        type: 'assistant',
        message: {
          content: [
            { type: 'advisor_tool_result', tool_use_id: 'srv1', content: 'advice text' },
            { type: 'text', text: 'ok' },
          ],
        },
      }),
    ])
    expect(facts.advisorCalls).toBe(1)
    // Both the server_tool_use and the paired result still count toward tool calls.
    expect(facts.toolCalls).toBe(1)
  })

  it('counts an advisor_tool_result with no matching call as one advisor call', () => {
    const facts = computeTranscriptFacts([
      line({
        type: 'assistant',
        message: {
          content: [{ type: 'advisor_tool_result', tool_use_id: 'orphan', content: 'x' }],
        },
      }),
    ])
    expect(facts.advisorCalls).toBe(1)
  })

  it('excludes a sidechain user prompt from the userPrompts total', () => {
    const facts = computeTranscriptFacts([
      line({ type: 'user', message: { content: 'main session prompt' } }),
      line({ type: 'user', isSidechain: true, message: { content: 'subagent dispatch prompt' } }),
    ])
    expect(facts.userPrompts).toBe(1)
  })

  it('excludes a sidechain assistant response from assistantResponses, but tracks its tokens separately as spend', () => {
    const facts = computeTranscriptFacts([
      line({
        type: 'assistant',
        isSidechain: true,
        message: {
          content: [],
          usage: {
            input_tokens: 100,
            output_tokens: 200,
            cache_read_input_tokens: 300,
            cache_creation_input_tokens: 400,
          },
        },
      }),
      assistantUsage({
        input_tokens: 1,
        output_tokens: 2,
        cache_read_input_tokens: 3,
        cache_creation_input_tokens: 4,
      }),
    ])
    expect(facts.assistantResponses).toBe(1)
    expect(facts.tokens).toEqual({ input: 1, output: 2, cacheRead: 3, cacheCreation: 4 })
    expect(facts.subagentTokens).toEqual({
      input: 100,
      output: 200,
      cacheRead: 300,
      cacheCreation: 400,
    })
  })

  it('segregates sidechain (subagent) tool calls without excluding them from the total', () => {
    const facts = computeTranscriptFacts([
      line({
        type: 'assistant',
        isSidechain: true,
        message: { content: [{ type: 'tool_use', id: 'a', name: 'Read', input: {} }] },
      }),
      line({
        type: 'assistant',
        isSidechain: false,
        message: { content: [{ type: 'tool_use', id: 'b', name: 'Read', input: {} }] },
      }),
    ])
    expect(facts.toolCalls).toBe(2)
    expect(facts.subagentToolCalls).toBe(1)
  })

  it('accepts mixed raw and owned-segment child representations for Claude transcripts', () => {
    const child = line({
      type: 'assistant',
      isSidechain: true,
      message: { content: [{ type: 'tool_use', id: 'child', name: 'Read', input: {} }] },
    })
    const facts = computeTranscriptFacts(
      [line({ type: 'user', message: { content: 'start' } })],
      [
        [child],
        {
          lines: [child],
          baseline: { input: 10, output: 20, cacheRead: 30, cacheCreation: 40 },
        },
      ],
    )
    expect(facts.subagentToolCalls).toBe(2)
  })

  it('dedupes a record replayed across files (e.g. a resumed/branched session) by uuid', () => {
    const record = {
      type: 'user',
      uuid: 'dup-1',
      message: { content: 'do the thing' },
    }
    const facts = computeTranscriptFacts([line(record), line(record)])
    expect(facts.userPrompts).toBe(1)
  })

  it('still counts records with distinct uuids, and records with no uuid at all', () => {
    const facts = computeTranscriptFacts([
      line({ type: 'user', uuid: 'a', message: { content: 'first' } }),
      line({ type: 'user', uuid: 'b', message: { content: 'second' } }),
      line({ type: 'user', message: { content: 'third, no uuid' } }),
    ])
    expect(facts.userPrompts).toBe(3)
  })

  it('ignores non-object content blocks (e.g. a stray string or null) without throwing', () => {
    const facts = computeTranscriptFacts([
      line({ type: 'assistant', message: { content: ['not an object', null, 42] } }),
    ])
    expect(facts.toolCalls).toBe(0)
  })

  it('ignores record types with no message content, like attachment/mode/worktree-state', () => {
    const facts = computeTranscriptFacts([
      line({ type: 'mode', mode: 'normal' }),
      line({ type: 'attachment', attachment: { type: 'hook_success' } }),
      line({ type: 'worktree-state', worktreeSession: {} }),
    ])
    expect(facts).toMatchObject({ userPrompts: 0, assistantResponses: 0, toolCalls: 0 })
  })
})
