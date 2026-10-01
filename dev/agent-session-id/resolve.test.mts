import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  defaultBlackboardAgent,
  requireBlackboardIdentity,
  resolveAmbientBlackboardIdentity,
  resolveSessionId,
} from './resolve.mts'
import { isValidSessionId } from './valid-id.mts'

const testDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'agent-session-id-'))
  testDirs.push(dir)
  return dir
}

describe('Blackboard identity resolution', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('keeps the session paired with the one harness whose own env is set', () => {
    for (const [env, agent, sessionId] of [
      [{ CLAUDE_CODE_SESSION_ID: 'claude' }, 'claude-code', 'claude'],
      [{ CODEX_THREAD_ID: 'codex' }, 'codex', 'codex'],
      [{ CURSOR_SESSION_ID: 'cursor' }, 'cursor', 'cursor'],
      [{ GROK_SESSION_ID: 'grok', GROK_HOOK_EVENT: '1' }, 'grok', 'grok'],
      [{ CLAUDECODE: '1', GROK_SESSION_ID: 'grok' }, 'grok', 'grok'],
      // One id exported by two harnesses names one session, so it is not a conflict.
      [{ CLAUDE_CODE_SESSION_ID: 'same', GROK_SESSION_ID: 'same' }, 'claude-code', 'same'],
    ] as const) {
      expect(resolveAmbientBlackboardIdentity({ env })).toMatchObject({ agent, sessionId })
    }
  })

  it('asks for an explicit session id when several harnesses own different ids', () => {
    for (const env of [
      { CLAUDE_CODE_SESSION_ID: 'claude', CODEX_THREAD_ID: 'codex' },
      { CLAUDE_CODE_SESSION_ID: 'claude', GROK_SESSION_ID: 'grok', GROK_HOOK_EVENT: '1' },
      { CLAUDECODE: '1', CODEX_THREAD_ID: 'codex', GROK_SESSION_ID: 'grok' },
      { CURSOR_SESSION_ID: 'cursor', GROK_SESSION_ID: 'grok' },
    ]) {
      expect(() => resolveSessionId({ env })).toThrow(/ambiguous session id.*--session-id/u)
      expect(() => defaultBlackboardAgent(env)).toThrow(/ambiguous session id/u)
    }
    expect(() =>
      resolveSessionId({ env: { CLAUDE_CODE_SESSION_ID: 'a', CODEX_THREAD_ID: 'b' } }),
    ).toThrow('CLAUDE_CODE_SESSION_ID, CODEX_THREAD_ID')
  })

  it('does not treat markers as session owners', () => {
    expect(
      resolveAmbientBlackboardIdentity({
        env: { CLAUDECODE: '1', CODEX_THREAD_ID: 'codex', GROK_AGENT: '1', CURSOR_AGENT: '1' },
      }),
    ).toBeUndefined()
  })

  it('lets an explicit id or runtime hint settle a conflicting environment', () => {
    const env = { CLAUDE_CODE_SESSION_ID: 'claude', CODEX_THREAD_ID: 'codex' }
    expect(resolveAmbientBlackboardIdentity({ env, sessionIdArg: 'codex' })).toEqual({
      agent: 'codex',
      harness: 'codex',
      sessionId: 'codex',
    })
    expect(resolveAmbientBlackboardIdentity({ env, runtime: 'codex' })).toEqual({
      agent: 'codex',
      harness: 'codex',
      sessionId: 'codex',
    })
    // An id that no harness issued has no inferable owner, so the label is left unset.
    expect(resolveAmbientBlackboardIdentity({ env, sessionIdArg: 'payload' })).toBeUndefined()
    expect(requireBlackboardIdentity({ agentArg: 'codex', env, sessionIdArg: 'payload' })).toEqual({
      agent: 'codex',
      sessionId: 'payload',
    })
    expect(
      resolveAmbientBlackboardIdentity({ env, runtime: 'codex', sessionIdArg: 'payload' }),
    ).toMatchObject({ agent: 'codex', sessionId: 'payload' })
  })

  it('fails closed for ambiguous Claude-compat signals and invalid selected ids', () => {
    expect(
      resolveSessionId({ env: { CLAUDECODE: '1', CODEX_THREAD_ID: 'stale-codex' } }),
    ).toBeUndefined()
    expect(
      resolveSessionId({ env: { CLAUDECODE: '1', CURSOR_SESSION_ID: 'stale-cursor' } }),
    ).toBeUndefined()
    expect(
      resolveSessionId({ env: { CLAUDECODE: '1', CODEX_THREAD_ID: 'ambiguous', GROK_AGENT: '1' } }),
    ).toBeUndefined()
    expect(() => requireBlackboardIdentity({ env: { CODEX_THREAD_ID: '../invalid' } })).toThrow(
      'invalid session id format: ../invalid',
    )
  })

  it('honors explicit session ids without requiring an ambient harness', async () => {
    const cwd = await makeTempDir()
    expect(resolveSessionId({ sessionIdArg: 'explicit', cwd, env: {} })).toBe('explicit')
  })

  it('does not pair an explicit root-Codex identity with another agent', () => {
    expect(() =>
      requireBlackboardIdentity({ agentArg: 'claude-code', env: {}, rootCodex: true }),
    ).toThrow('--root-codex requires --agent codex')
  })

  it('does not pair an explicit root-Codex identity with an empty agent override', async () => {
    const cwd = await makeTempDir()
    expect(() =>
      requireBlackboardIdentity({ agentArg: '', cwd, env: {}, rootCodex: true }),
    ).toThrow('--root-codex requires --agent codex')
  })

  it('pairs a supplied Grok hook payload id with Grok ahead of a Claude runtime hint', () => {
    expect(
      resolveAmbientBlackboardIdentity({
        env: { CLAUDECODE: '1', GROK_HOOK_EVENT: 'SessionStart' },
        runtime: 'claude',
        sessionIdArg: 'grok-hook-payload',
      }),
    ).toEqual({ agent: 'grok', harness: 'grok', sessionId: 'grok-hook-payload' })
  })

  it('pairs a supplied Codex payload id with its runtime ahead of an unrelated Claude session', () => {
    expect(
      resolveAmbientBlackboardIdentity({
        env: { CLAUDE_CODE_SESSION_ID: 'stale-claude' },
        runtime: 'codex',
        sessionIdArg: 'codex-hook-payload',
      }),
    ).toEqual({ agent: 'codex', harness: 'codex', sessionId: 'codex-hook-payload' })
  })

  it('keeps an ambient identity ahead of a weaker transcript-only hint', () => {
    expect(
      resolveAmbientBlackboardIdentity({
        env: { CURSOR_SESSION_ID: 'cursor-session' },
        sessionIdArg: 'payload-id',
        transcriptPath: '/tmp/.codex/sessions/rollout-2026-payload-id.jsonl',
      }),
    ).toEqual({ agent: 'cursor', harness: 'cursor', sessionId: 'payload-id' })
  })

  it('projects the same ambient precedence into Blackboard agents', async () => {
    const cwd = await makeTempDir()
    expect(defaultBlackboardAgent({ CODEX_THREAD_ID: 'thread' }, cwd)).toBe('codex')
    expect(defaultBlackboardAgent({ CURSOR_SESSION_ID: 'sess' }, cwd)).toBe('cursor')
    expect(defaultBlackboardAgent({ GROK_SESSION_ID: 'sess' }, cwd)).toBe('grok')
    expect(defaultBlackboardAgent({ CODEX_THREAD_ID: 'stale' }, cwd, { runtime: 'grok' })).toBe(
      'grok',
    )
  })
})

describe('isValidSessionId', () => {
  it('accepts alphanumeric, hyphen, and underscore tokens', () => {
    expect(isValidSessionId('abc-123_XYZ')).toBe(true)
  })

  it('rejects path traversal and glob metacharacter sequences', () => {
    expect(isValidSessionId('../../etc/passwd')).toBe(false)
    expect(isValidSessionId('a/b')).toBe(false)
    expect(isValidSessionId('*')).toBe(false)
    expect(isValidSessionId('')).toBe(false)
  })
})
