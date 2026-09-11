import { describe, expect, it } from 'vitest'

import { computeTranscriptFacts, segmentCodexChild } from '../compute.mts'

function line(record: unknown): string {
  return JSON.stringify(record)
}

describe('computeTranscriptFacts Codex records', () => {
  it('counts visible messages, both call kinds, structural failures, and commands', () => {
    const facts = computeTranscriptFacts([
      line({ type: 'event_msg', payload: { type: 'user_message' } }),
      line({ type: 'event_msg', payload: { type: 'agent_message' } }),
      line({
        type: 'response_item',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          arguments: JSON.stringify({ cmd: 'pnpm run no-mistakes\ngit push' }),
        },
      }),
      line({
        type: 'response_item',
        payload: { type: 'custom_tool_call', name: 'apply_patch', status: 'failed', input: '' },
      }),
      line({
        type: 'response_item',
        payload: { type: 'custom_tool_call', name: 'shell', input: 'pnpm run no-mistakes' },
      }),
      line({
        type: 'response_item',
        payload: { type: 'function_call_output', status: 'failed' },
      }),
    ])
    expect(facts).toMatchObject({
      userPrompts: 1,
      assistantResponses: 1,
      toolCalls: 3,
      failedToolCalls: 2,
      noMistakesInvocations: 2,
      pushCommandAttempts: 1,
    })
  })

  it('uses cumulative token deltas, cached input, and deduped compactions', () => {
    const token = (input: number, output: number, cached: number): string =>
      line({
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: input,
              output_tokens: output,
              cached_input_tokens: cached,
            },
          },
        },
      })
    const facts = computeTranscriptFacts([
      line({ type: 'event_msg', payload: { type: 'task_started' } }),
      token(10, 2, 4),
      token(15, 5, 7),
      line({ type: 'event_msg', payload: { type: 'context_compacted' } }),
      line({ type: 'compacted', payload: {} }),
    ])
    expect(facts.tokens).toEqual({ input: 15, output: 5, cacheRead: 7, cacheCreation: 0 })
    expect(facts.compactions).toBe(1)
  })

  it('strips inherited parent history but counts every later child follow-up marker', () => {
    const timestamp = '2026-07-13T10:00:00.900Z'
    const sessionSeconds = Math.floor(Date.parse(timestamp) / 1000)
    const main = [line({ type: 'session_meta', payload: { id: 'parent' } })]
    const child = [
      line({
        type: 'session_meta',
        payload: {
          id: 'child',
          session_id: 'parent',
          timestamp,
          source: { subagent: { thread_spawn: { parent_thread_id: 'parent' } } },
        },
      }),
      line({
        type: 'event_msg',
        payload: { type: 'task_started', started_at: sessionSeconds - 30 },
      }),
      line({
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: { input_tokens: 100, output_tokens: 20, cached_input_tokens: 40 },
          },
        },
      }),
      line({ type: 'event_msg', payload: { type: 'task_started', started_at: sessionSeconds } }),
      line({ type: 'inter_agent_communication_metadata', payload: {} }),
      line({ type: 'response_item', payload: { type: 'function_call', name: 'first' } }),
      line({
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: { input_tokens: 120, output_tokens: 25, cached_input_tokens: 45 },
          },
        },
      }),
      line({
        type: 'event_msg',
        payload: { type: 'task_started', started_at: (sessionSeconds + 20) * 1000 },
      }),
      line({ type: 'inter_agent_communication_metadata', payload: {} }),
      line({ type: 'response_item', payload: { type: 'function_call', name: 'followup' } }),
      line({
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: { input_tokens: 130, output_tokens: 27, cached_input_tokens: 50 },
          },
        },
      }),
    ]
    const segmented = segmentCodexChild(child)
    expect(segmented).not.toHaveProperty('error')
    if ('error' in segmented) return
    const facts = computeTranscriptFacts(main, [segmented.segment])
    expect(facts.subagentToolCalls).toBe(2)
    expect(facts.subagentTokens).toEqual({ input: 30, output: 7, cacheRead: 10, cacheCreation: 0 })
  })

  it('strips a nested parent owned history once and retains nested follow-ups', () => {
    const parentTimestamp = '2026-07-13T10:00:00.100Z'
    const childTimestamp = '2026-07-13T10:01:00.100Z'
    const parentSeconds = Math.floor(Date.parse(parentTimestamp) / 1000)
    const childSeconds = Math.floor(Date.parse(childTimestamp) / 1000)
    const root = [line({ type: 'session_meta', payload: { id: 'root' } })]
    const parent = [
      line({
        type: 'session_meta',
        payload: { id: 'parent', session_id: 'root', timestamp: parentTimestamp },
      }),
      line({ type: 'event_msg', payload: { type: 'task_started', started_at: parentSeconds - 5 } }),
      line({ type: 'event_msg', payload: { type: 'task_started', started_at: parentSeconds } }),
      line({ type: 'inter_agent_communication_metadata', payload: {} }),
      line({ type: 'response_item', payload: { type: 'function_call', name: 'parent' } }),
      line({
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: { input_tokens: 40, output_tokens: 4, cached_input_tokens: 10 },
          },
        },
      }),
    ]
    const child = [
      line({
        type: 'session_meta',
        payload: { id: 'child', session_id: 'parent', timestamp: childTimestamp },
      }),
      line({ type: 'event_msg', payload: { type: 'task_started', started_at: parentSeconds } }),
      line({ type: 'response_item', payload: { type: 'function_call', name: 'restamped-parent' } }),
      line({
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: { input_tokens: 40, output_tokens: 4, cached_input_tokens: 10 },
          },
        },
      }),
      line({
        type: 'event_msg',
        payload: { type: 'task_started', started_at: childSeconds * 1000 },
      }),
      line({ type: 'inter_agent_communication_metadata', payload: {} }),
      line({ type: 'response_item', payload: { type: 'function_call', name: 'child' } }),
      line({
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: { input_tokens: 55, output_tokens: 7, cached_input_tokens: 14 },
          },
        },
      }),
      line({ type: 'event_msg', payload: { type: 'task_started', started_at: childSeconds + 10 } }),
      line({ type: 'inter_agent_communication_metadata', payload: {} }),
      line({ type: 'response_item', payload: { type: 'function_call', name: 'followup' } }),
    ]
    const parentSegment = segmentCodexChild(parent)
    const childSegment = segmentCodexChild(child)
    expect(parentSegment).not.toHaveProperty('error')
    expect(childSegment).not.toHaveProperty('error')
    if ('error' in parentSegment || 'error' in childSegment) return
    const facts = computeTranscriptFacts(root, [parentSegment.segment, childSegment.segment])
    expect(facts.subagentToolCalls).toBe(3)
    expect(facts.subagentTokens).toEqual({ input: 55, output: 7, cacheRead: 14, cacheCreation: 0 })
  })

  it('fails closed when inherited metadata lacks a valid timestamp or owned boundary', () => {
    expect(
      segmentCodexChild([line({ type: 'session_meta', payload: { parent_thread_id: 'parent' } })]),
    ).toEqual({ error: 'Codex child has invalid session timestamp' })
    expect(
      segmentCodexChild([
        line({
          type: 'session_meta',
          payload: { parent_thread_id: 'parent', timestamp: '2026-07-13T10:00:00Z' },
        }),
        line({ type: 'event_msg', payload: { type: 'task_started', started_at: 1 } }),
      ]),
    ).toEqual({
      error: 'Codex child has no owned task boundary',
    })
  })

  it('accepts a child with no copied history when metadata declares no parent', () => {
    const child = [
      line({ type: 'session_meta', payload: { id: 'standalone-child' } }),
      line({ type: 'response_item', payload: { type: 'function_call', name: 'owned' } }),
    ]
    const segmented = segmentCodexChild(child)
    expect(segmented).not.toHaveProperty('error')
    if ('error' in segmented) return
    expect(
      computeTranscriptFacts([line({ type: 'session_meta', payload: {} })], [segmented.segment])
        .subagentToolCalls,
    ).toBe(1)
  })

  it('rejects unsegmented Codex child lines instead of assuming an empty token baseline', () => {
    expect(() =>
      computeTranscriptFacts(
        [line({ type: 'session_meta', payload: { id: 'parent' } })],
        [[line({ type: 'event_msg', payload: { type: 'task_started' } })]],
      ),
    ).toThrow('Codex subagents must be segmented before facts are computed')
  })

  it('deduplicates structurally failed call/output pairs by call_id', () => {
    const facts = computeTranscriptFacts([
      line({ type: 'event_msg', payload: { type: 'task_started' } }),
      line({
        type: 'response_item',
        payload: {
          type: 'custom_tool_call',
          name: 'exec',
          input: '',
          status: 'failed',
          call_id: 'call-1',
        },
      }),
      line({
        type: 'response_item',
        payload: { type: 'custom_tool_call_output', status: 'failed', call_id: 'call-1' },
      }),
    ])
    expect(facts.failedToolCalls).toBe(1)
  })

  it('counts structured event failures and deduplicates them by call_id', () => {
    const facts = computeTranscriptFacts([
      line({ type: 'event_msg', payload: { type: 'task_started' } }),
      line({
        type: 'event_msg',
        payload: { type: 'patch_apply_end', success: false, call_id: 'call-1' },
      }),
      line({
        type: 'response_item',
        payload: { type: 'custom_tool_call_output', status: 'failed', call_id: 'call-1' },
      }),
      line({
        type: 'event_msg',
        payload: { type: 'patch_apply_end', success: false, call_id: 'call-2' },
      }),
    ])
    expect(facts.failedToolCalls).toBe(2)
  })

  it('extracts embedded exec commands and ignores quoted decoys', () => {
    const input = [
      `const decoy = 'tools.exec_command({"cmd":"git push decoy"})'`,
      'await tools.exec_command({"cmd":"git status\\npnpm run no-mistakes"})',
      'await tools.exec_command({"cmd":"git push origin HEAD","nested":{"brace":"}"}})',
      'tools.exec_command(notJson)',
    ].join('\n')
    const facts = computeTranscriptFacts([
      line({ type: 'event_msg', payload: { type: 'task_started' } }),
      line({ type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', input } }),
    ])
    expect(facts.noMistakesInvocations).toBe(1)
    expect(facts.pushCommandAttempts).toBe(1)
  })
})
