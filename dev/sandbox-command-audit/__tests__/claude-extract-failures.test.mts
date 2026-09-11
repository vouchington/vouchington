import { describe, expect, it } from 'vitest'

import { extractClaudeRecords } from '../claude-extract.mts'

function assistantToolUse(id: string, name: string, input: Record<string, unknown>): string {
  return JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id, name, input }] },
  })
}

// Escalation/denial classification lives in claude-extract.test.mts; this file covers
// sandbox-failure classification (genuine vs. e2big vs. ordinary-app-failure) — split to
// keep both files under the 300-line test cap.
describe('extractClaudeRecords — sandbox failures', () => {
  it('classifies a genuine permission failure from a string tool_result content', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'chmod 000 /etc/shadow' }),
      JSON.stringify({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 't1',
              is_error: true,
              content: 'chmod: Operation not permitted',
            },
          ],
        },
      }),
    ]
    const result = extractClaudeRecords(lines)
    expect(result.sandboxFailures).toEqual([
      {
        source: 'claude',
        kind: 'genuine',
        command: 'chmod 000 /etc/shadow',
        errorText: 'chmod: Operation not permitted',
      },
    ])
  })

  it('classifies a genuine failure from an array-of-blocks tool_result content', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'chmod 000 x' }),
      JSON.stringify({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 't1',
              is_error: true,
              content: [{ type: 'text', text: 'EACCES: permission denied' }],
            },
          ],
        },
      }),
    ]
    const result = extractClaudeRecords(lines)
    expect(result.sandboxFailures).toEqual([
      {
        source: 'claude',
        kind: 'genuine',
        command: 'chmod 000 x',
        errorText: 'EACCES: permission denied',
      },
    ])
  })

  // ECONNREFUSED is deliberately not a genuine-failure signature (see the comment on
  // GENUINE_FAILURE_PATTERNS): it's indistinguishable from a routine app-level failure
  // (nothing listening on that port), even against a localhost target.
  it('ignores an ECONNREFUSED failure as an ordinary app-level error, not a sandbox signature', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'curl http://localhost:9999' }),
      JSON.stringify({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 't1',
              is_error: true,
              content: [{ type: 'text', text: 'curl: (7) Failed to connect: ECONNREFUSED' }],
            },
          ],
        },
      }),
    ]
    expect(extractClaudeRecords(lines).sandboxFailures).toEqual([])
  })

  // The retro audit doc (sandbox-audit.md) documents "localhost timeout" as a genuine
  // Section-1 bypass source distinct from the excluded ECONNREFUSED case: a timeout
  // (vs. an immediate refusal) against a loopback target is this sandbox's signature
  // for a silently-dropped connection.
  it('classifies an ETIMEDOUT failure against a loopback address as genuine', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'curl http://localhost:3000' }),
      JSON.stringify({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 't1',
              is_error: true,
              content: 'curl: connect ETIMEDOUT 127.0.0.1:3000',
            },
          ],
        },
      }),
    ]
    const result = extractClaudeRecords(lines)
    expect(result.sandboxFailures).toEqual([
      {
        source: 'claude',
        kind: 'genuine',
        command: 'curl http://localhost:3000',
        errorText: 'curl: connect ETIMEDOUT 127.0.0.1:3000',
      },
    ])
  })

  it('classifies a "timed out" failure text against localhost as genuine', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'curl http://localhost:3000' }),
      JSON.stringify({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 't1',
              is_error: true,
              content: 'Connection to localhost timed out',
            },
          ],
        },
      }),
    ]
    expect(extractClaudeRecords(lines).sandboxFailures).toEqual([
      {
        source: 'claude',
        kind: 'genuine',
        command: 'curl http://localhost:3000',
        errorText: 'Connection to localhost timed out',
      },
    ])
  })

  it('ignores a bare timeout with no loopback reference (not a sandbox signature)', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'curl https://example.com' }),
      JSON.stringify({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 't1',
              is_error: true,
              content: 'Request timed out',
            },
          ],
        },
      }),
    ]
    expect(extractClaudeRecords(lines).sandboxFailures).toEqual([])
  })

  it('ignores a loopback reference with no timeout token', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'curl http://localhost:3000' }),
      JSON.stringify({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 't1',
              is_error: true,
              content: 'curl: connection reset by peer at localhost',
            },
          ],
        },
      }),
    ]
    expect(extractClaudeRecords(lines).sandboxFailures).toEqual([])
  })

  it('extracts no failure text when tool_result content is neither string nor array', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'echo hi' }),
      JSON.stringify({
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 't1', is_error: true, content: { weird: true } },
          ],
        },
      }),
    ]
    expect(extractClaudeRecords(lines).sandboxFailures).toEqual([])
  })

  it('ignores non-text blocks inside an array tool_result content', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'echo hi' }),
      JSON.stringify({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 't1',
              is_error: true,
              content: [
                { type: 'image', source: 'x' },
                { type: 'text', text: 'permission denied' },
              ],
            },
          ],
        },
      }),
    ]
    const result = extractClaudeRecords(lines)
    expect(result.sandboxFailures[0]?.errorText).toBe('\npermission denied')
  })

  it('classifies an E2BIG failure separately from genuine failures', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'git status' }),
      JSON.stringify({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 't1',
              is_error: true,
              content: 'posix_spawn E2BIG',
            },
          ],
        },
      }),
    ]
    const result = extractClaudeRecords(lines)
    expect(result.sandboxFailures).toEqual([
      { source: 'claude', kind: 'e2big', command: 'git status', errorText: 'posix_spawn E2BIG' },
    ])
  })

  it('ignores an is_error Bash failure that matches no known signature (ordinary app failure)', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'pnpm test' }),
      JSON.stringify({
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 't1', is_error: true, content: '3 tests failed' },
          ],
        },
      }),
    ]
    expect(extractClaudeRecords(lines).sandboxFailures).toEqual([])
  })

  it('ignores a non-error tool_result', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'pnpm test' }),
      JSON.stringify({
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 't1', is_error: false, content: 'ok' }],
        },
      }),
    ]
    const result = extractClaudeRecords(lines)
    expect(result.sandboxFailures).toEqual([])
    expect(result.denials).toEqual([])
  })
})
