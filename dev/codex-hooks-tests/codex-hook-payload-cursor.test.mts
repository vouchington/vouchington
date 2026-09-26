import { describe, expect, it } from 'vitest'

import {
  hookSessionId,
  readHookPayload,
  resolvePreToolUseRuntime,
} from '../codex-hooks/hook-payload.mts'

// Cursor runs the Claude-compat hooks from .claude/settings.json. These cover the two places it
// differs from Claude: its runtime markers and its `Shell`/`tool_output` payload dialect.
describe('Cursor PreToolUse runtime', () => {
  it.each([{ CURSOR_VERSION: 'present' }, { CURSOR_PROJECT_DIR: '/repo' }])(
    'overrides argv claude when %o is set',
    env => {
      expect(resolvePreToolUseRuntime('claude', env)).toBe('cursor')
    },
  )

  it('overrides argv claude when the payload carries cursor_version', () => {
    expect(resolvePreToolUseRuntime('claude', {}, { cursor_version: 'present' })).toBe('cursor')
  })

  it('keeps argv codex when only the Cursor env is set', () => {
    expect(resolvePreToolUseRuntime('codex', { CURSOR_VERSION: 'present' })).toBe('codex')
  })

  it('keeps argv codex when a stale payload carries cursor_version', () => {
    expect(resolvePreToolUseRuntime('codex', {}, { cursor_version: 'present' })).toBe('codex')
  })

  it('keeps Grok ahead of Cursor', () => {
    expect(
      resolvePreToolUseRuntime('claude', { CURSOR_VERSION: 'present', GROK_SESSION_ID: 'sess' }),
    ).toBe('grok')
  })
})

describe('readHookPayload — Cursor Shell normalization', () => {
  const shell = {
    cursor_version: 'present',
    tool_input: { command: 'git status' },
    tool_name: 'Shell',
  }

  it('maps a PreToolUse Shell payload to Bash', () => {
    expect(readHookPayload(JSON.stringify(shell))).toEqual({ ...shell, tool_name: 'Bash' })
  })

  it('uses conversation_id as the shared session identity fallback', () => {
    expect(hookSessionId({ conversation_id: 'cursor-conversation' })).toBe('cursor-conversation')
  })

  it.each([
    ['a JSON string', JSON.stringify({ exitCode: 1, output: 'fatal' })],
    ['an object', { exitCode: 1, output: 'fatal' }],
  ])('lifts tool_output given as %s onto tool_response', (_, toolOutput) => {
    expect(readHookPayload(JSON.stringify({ ...shell, tool_output: toolOutput }))).toMatchObject({
      tool_name: 'Bash',
      tool_response: { exit_code: 1, stdout: 'fatal' },
    })
  })

  it('leaves tool_response absent when tool_output is not parseable', () => {
    expect(
      readHookPayload(JSON.stringify({ ...shell, tool_output: 'not json' })),
    ).not.toHaveProperty('tool_response')
  })

  it.each([
    ['Claude success', { tool_name: 'Bash', tool_response: { stderr: '', stdout: 'ok' } }],
    ['Claude failure', { tool_name: 'Bash', tool_response: 'Error: Exit code 1: boom' }],
    ['Codex', { tool_name: 'Bash', tool_response: 'merged output' }],
    ['Grok', { toolName: 'run_terminal_command', tool_response: { exit_code: 1 } }],
  ])('passes a %s payload through unchanged', (_, payload) => {
    expect(readHookPayload(JSON.stringify(payload))).toEqual(payload)
  })

  it.each(['null', '1', 'not json'])('reads %s as an empty payload', stdin => {
    expect(readHookPayload(stdin)).toEqual({})
  })
})
