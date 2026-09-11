import { describe, expect, it } from 'vitest'

import { extractClaudeRecords } from '../claude-extract.mts'

function assistantToolUse(id: string, name: string, input: Record<string, unknown>): string {
  return JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id, name, input }] },
  })
}

// Sandbox-failure classification (genuine vs. e2big vs. ordinary-app-failure) lives in
// claude-extract-failures.test.mts to keep this file under the 300-line test cap.
describe('extractClaudeRecords — escalations and denials', () => {
  it('records an escalation for a Bash tool_use with dangerouslyDisableSandbox: true', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', {
        command: 'git push origin main',
        dangerouslyDisableSandbox: true,
      }),
    ]
    const result = extractClaudeRecords(lines)
    expect(result.escalations).toEqual([{ source: 'claude', command: 'git push origin main' }])
    expect(result.denials).toEqual([])
    expect(result.sandboxFailures).toEqual([])
  })

  it('does not record an escalation for a sandboxed Bash call', () => {
    const lines = [assistantToolUse('t1', 'Bash', { command: 'pwd' })]
    expect(extractClaudeRecords(lines).escalations).toEqual([])
  })

  it('does not record an escalation for a non-Bash tool even with the flag set', () => {
    const lines = [
      assistantToolUse('t1', 'Read', { command: 'ignored', dangerouslyDisableSandbox: true }),
    ]
    expect(extractClaudeRecords(lines).escalations).toEqual([])
  })

  it('classifies a user-rejected Bash denial and keeps the correlated command', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'rm -rf /tmp/x' }),
      JSON.stringify({
        type: 'user',
        toolDenialKind: 'user-rejected',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'denied' }],
        },
      }),
    ]
    const result = extractClaudeRecords(lines)
    expect(result.denials).toEqual([
      { source: 'claude', kind: 'user-rejected', command: 'rm -rf /tmp/x' },
    ])
  })

  it('classifies permission-rule and automode-blocked denials without treating them as candidates', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'curl evil.example' }),
      JSON.stringify({
        type: 'user',
        toolDenialKind: 'permission-rule',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'blocked' }],
        },
      }),
      assistantToolUse('t2', 'Bash', { command: 'curl evil2.example' }),
      JSON.stringify({
        type: 'user',
        toolDenialKind: 'automode-blocked',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 't2', is_error: true, content: 'blocked' }],
        },
      }),
    ]
    const result = extractClaudeRecords(lines)
    expect(result.denials.map(record => record.kind)).toEqual([
      'permission-rule',
      'automode-blocked',
    ])
  })

  it('ignores a denial correlated to a non-Bash tool_use', () => {
    const lines = [
      assistantToolUse('t1', 'AskUserQuestion', { command: 'ignored' }),
      JSON.stringify({
        type: 'user',
        toolDenialKind: 'user-rejected',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'denied' }],
        },
      }),
    ]
    expect(extractClaudeRecords(lines).denials).toEqual([])
  })

  it('skips blank lines and unparseable JSON without throwing', () => {
    const lines = ['', '   ', 'not json', assistantToolUse('t1', 'Bash', { command: 'pwd' })]
    expect(() => extractClaudeRecords(lines)).not.toThrow()
  })

  it('ignores a tool_result whose tool_use_id has no correlated tool_use', () => {
    const lines = [
      JSON.stringify({
        type: 'user',
        toolDenialKind: 'user-rejected',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'missing', is_error: true, content: 'x' }],
        },
      }),
    ]
    expect(extractClaudeRecords(lines).denials).toEqual([])
  })

  it('ignores assistant/user records with no content array and other record types', () => {
    const lines = [
      JSON.stringify({ type: 'assistant', message: {} }),
      JSON.stringify({ type: 'user', message: {} }),
      JSON.stringify({ type: 'summary' }),
    ]
    const result = extractClaudeRecords(lines)
    expect(result).toEqual({ escalations: [], denials: [], sandboxFailures: [] })
  })

  it('ignores a tool_use block missing an id or name', () => {
    const lines = [
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Bash' }] },
      }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1' }] } }),
    ]
    expect(() => extractClaudeRecords(lines)).not.toThrow()
  })

  it('accepts a server_tool_use block the same as tool_use', () => {
    const lines = [
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'server_tool_use',
              id: 't1',
              name: 'Bash',
              input: { command: 'git status', dangerouslyDisableSandbox: true },
            },
          ],
        },
      }),
    ]
    expect(extractClaudeRecords(lines).escalations).toEqual([
      { source: 'claude', command: 'git status' },
    ])
  })

  it('ignores a content block that is not a record (e.g. a bare string)', () => {
    const lines = [JSON.stringify({ type: 'assistant', message: { content: ['not-a-block'] } })]
    expect(() => extractClaudeRecords(lines)).not.toThrow()
  })

  it('records a tool_use with no input as having no command', () => {
    const lines = [
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash' }] },
      }),
      JSON.stringify({
        type: 'user',
        toolDenialKind: 'user-rejected',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'denied' }],
        },
      }),
    ]
    const result = extractClaudeRecords(lines)
    expect(result.denials).toEqual([
      { source: 'claude', kind: 'user-rejected', command: undefined },
    ])
  })

  it('ignores a tool_result block with a non-string tool_use_id', () => {
    const lines = [
      assistantToolUse('t1', 'Bash', { command: 'pwd' }),
      JSON.stringify({
        type: 'user',
        toolDenialKind: 'user-rejected',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 42, is_error: true, content: 'denied' }],
        },
      }),
    ]
    expect(extractClaudeRecords(lines).denials).toEqual([])
  })
})
