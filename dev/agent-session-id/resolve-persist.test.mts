import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { readPersistedSessionId, sessionPersistPath } from './persist.mts'
import {
  defaultBlackboardAgent,
  requireBlackboardIdentity,
  requireSessionId,
  resolveSessionId,
} from './resolve.mts'

const testDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'resolve-session-persist-'))
  testDirs.push(dir)
  return dir
}

describe('resolveSessionId persist fallback', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('reads the cursor persist file when no session env is set', async () => {
    const cwd = await makeTempDir()
    await mkdir(join(cwd, '.local'), { recursive: true })
    await writeFile(sessionPersistPath(cwd, 'cursor'), 'cursor-file\n', 'utf8')
    expect(resolveSessionId({ cwd, env: {} })).toBe('cursor-file')
    expect(defaultBlackboardAgent({}, cwd)).toBe('cursor')
  })

  it('reads the grok persist file only when GROK_AGENT is set', async () => {
    const cwd = await makeTempDir()
    await mkdir(join(cwd, '.local'), { recursive: true })
    await writeFile(sessionPersistPath(cwd, 'grok'), 'grok-file\n', 'utf8')
    expect(resolveSessionId({ cwd, env: {} })).toBeUndefined()
    expect(resolveSessionId({ cwd, env: { GROK_AGENT: '1' } })).toBe('grok-file')
    expect(defaultBlackboardAgent({ GROK_AGENT: '1' }, cwd)).toBe('grok')
    expect(defaultBlackboardAgent({}, cwd)).toBeUndefined()
  })

  it('resolves its own env over leftover persist files when CODEX_THREAD_ID is set', async () => {
    const cwd = await makeTempDir()
    await mkdir(join(cwd, '.local'), { recursive: true })
    await writeFile(sessionPersistPath(cwd, 'cursor'), 'cursor-file\n', 'utf8')
    await writeFile(sessionPersistPath(cwd, 'grok'), 'grok-file\n', 'utf8')
    expect(resolveSessionId({ cwd, env: { CODEX_THREAD_ID: 'codex' } })).toBe('codex')
    expect(requireSessionId({ cwd, env: { CODEX_THREAD_ID: 'codex' } })).toBe('codex')
    expect(defaultBlackboardAgent({ CODEX_THREAD_ID: 'codex' }, cwd)).toBe('codex')
  })

  it('prefers Claude env over a leftover cursor persist file', async () => {
    const cwd = await makeTempDir()
    await mkdir(join(cwd, '.local'), { recursive: true })
    await writeFile(sessionPersistPath(cwd, 'cursor'), 'cursor-file\n', 'utf8')
    expect(resolveSessionId({ cwd, env: { CLAUDE_CODE_SESSION_ID: 'claude' } })).toBe('claude')
    expect(defaultBlackboardAgent({ CLAUDE_CODE_SESSION_ID: 'claude' }, cwd)).toBe('claude-code')
  })

  it('keeps an explicit session projection without an ambient harness identity', async () => {
    const cwd = await makeTempDir()
    expect(resolveSessionId({ cwd, env: {}, sessionIdArg: 'explicit-id' })).toBe('explicit-id')
    expect(requireSessionId({ cwd, env: {}, sessionIdArg: 'explicit-id' })).toBe('explicit-id')
  })

  it('rejects root Codex combined with any explicit session id', async () => {
    const cwd = await makeTempDir()
    expect(() =>
      requireBlackboardIdentity({ cwd, env: {}, rootCodex: true, sessionIdArg: 'explicit-id' }),
    ).toThrow('--root-codex cannot be used with --session-id')
    expect(() => resolveSessionId({ cwd, env: {}, rootCodex: true, sessionIdArg: '' })).toThrow(
      '--root-codex cannot be used with --session-id',
    )
    expect(readPersistedSessionId(cwd, 'codex')).toBeUndefined()
  })

  it('creates and reuses an explicit root-Codex session without a thread id', async () => {
    const cwd = await makeTempDir()
    const first = resolveSessionId({ cwd, env: {}, rootCodex: true })
    expect(first).toMatch(/^codex-[a-zA-Z0-9_-]+$/)
    expect(readPersistedSessionId(cwd, 'codex')).toBe(first)

    expect(resolveSessionId({ cwd, env: {}, rootCodex: true })).toBe(first)
  })

  it('rotates an absent-thread root Codex session once, then reuses the selected id', async () => {
    const cwd = await makeTempDir()
    await mkdir(join(cwd, '.local'), { recursive: true })
    await writeFile(sessionPersistPath(cwd, 'codex'), 'codex-stale\n', 'utf8')

    const rotated = resolveSessionId({
      cwd,
      env: {},
      newRootCodexSession: true,
      rootCodex: true,
    })
    expect(rotated).toMatch(/^codex-/)
    expect(rotated).not.toBe('codex-stale')
    expect(readPersistedSessionId(cwd, 'codex')).toBe(rotated)
    expect(resolveSessionId({ cwd, env: {}, rootCodex: true })).toBe(rotated)
  })

  it('shares root Codex persistence with commands invoked from a worktree subdirectory', async () => {
    const cwd = await makeTempDir()
    const nested = join(cwd, 'nested', 'directory')
    await mkdir(nested, { recursive: true })
    await writeFile(join(cwd, '.git'), 'gitdir: /synthetic/worktree\n', 'utf8')

    const sessionId = resolveSessionId({ cwd: nested, env: {}, rootCodex: true })
    expect(readPersistedSessionId(cwd, 'codex')).toBe(sessionId)
    expect(readPersistedSessionId(nested, 'codex')).toBeUndefined()
  })

  it('replaces malformed stale persistence at an explicit root-session boundary', async () => {
    const cwd = await makeTempDir()
    await mkdir(join(cwd, '.local'), { recursive: true })
    await writeFile(sessionPersistPath(cwd, 'codex'), '../malformed\n', 'utf8')

    const rotated = resolveSessionId({
      cwd,
      env: {},
      newRootCodexSession: true,
      rootCodex: true,
    })
    expect(rotated).toMatch(/^codex-/)
    expect(readPersistedSessionId(cwd, 'codex')).toBe(rotated)
  })

  it('lets a real Codex thread id win a root-session rotation', async () => {
    const cwd = await makeTempDir()
    expect(
      resolveSessionId({
        cwd,
        env: { CODEX_THREAD_ID: 'real-thread' },
        newRootCodexSession: true,
        rootCodex: true,
      }),
    ).toBe('real-thread')
    expect(readPersistedSessionId(cwd, 'codex')).toBe('real-thread')
  })

  it('rejects rotation outside its unambiguous root-Codex authority', async () => {
    const cwd = await makeTempDir()
    expect(() => resolveSessionId({ cwd, env: {}, newRootCodexSession: true })).toThrow(
      '--new-root-codex-session requires --root-codex',
    )
    expect(() =>
      resolveSessionId({
        cwd,
        env: {},
        newRootCodexSession: true,
        rootCodex: true,
        sessionIdArg: 'explicit-id',
      }),
    ).toThrow('--root-codex cannot be used with --session-id')
    expect(() =>
      resolveSessionId({
        cwd,
        env: {},
        newRootCodexSession: true,
        parentSessionId: '',
        rootCodex: true,
      }),
    ).toThrow('--new-root-codex-session cannot be used with --parent-session-id')
    expect(() => resolveSessionId({ cwd, env: {}, parentSessionId: '', rootCodex: true })).toThrow(
      '--root-codex cannot be used with --parent-session-id',
    )
  })

  it('treats a blank ambient Codex thread id as missing', async () => {
    const cwd = await makeTempDir()
    const sessionId = resolveSessionId({
      cwd,
      env: { CODEX_THREAD_ID: '   ' },
      rootCodex: true,
    })
    expect(sessionId).toMatch(/^codex-[a-zA-Z0-9_-]+$/)
    expect(readPersistedSessionId(cwd, 'codex')).toBe(sessionId)
  })

  it('replaces a generated root-Codex session with a real thread id', async () => {
    const cwd = await makeTempDir()
    expect(resolveSessionId({ cwd, env: {}, rootCodex: true })).toMatch(/^codex-/)

    expect(
      resolveSessionId({ cwd, env: { CODEX_THREAD_ID: 'real-thread' }, rootCodex: true }),
    ).toBe('real-thread')
    expect(readPersistedSessionId(cwd, 'codex')).toBe('real-thread')
  })

  it('never cross-reads Cursor or Grok state for an explicit root-Codex session', async () => {
    const cwd = await makeTempDir()
    await mkdir(join(cwd, '.local'), { recursive: true })
    await writeFile(sessionPersistPath(cwd, 'cursor'), 'cursor-file\n', 'utf8')
    await writeFile(sessionPersistPath(cwd, 'grok'), 'grok-file\n', 'utf8')

    const sessionId = resolveSessionId({ cwd, env: {}, rootCodex: true })
    expect(sessionId).toMatch(/^codex-/)
    expect(sessionId).not.toBe('cursor-file')
    expect(sessionId).not.toBe('grok-file')
  })

  it('never creates a Codex session from a runtime hint or detached process', async () => {
    const cwd = await makeTempDir()
    expect(resolveSessionId({ cwd, env: {}, runtime: 'codex' })).toBeUndefined()
    expect(resolveSessionId({ cwd, env: {} })).toBeUndefined()
    expect(readPersistedSessionId(cwd, 'codex')).toBeUndefined()
  })

  it('fails closed when an explicit root-Codex session cannot persist its id', async () => {
    const cwd = await makeTempDir()
    await writeFile(join(cwd, '.local'), 'not a directory\n', 'utf8')

    expect(() => resolveSessionId({ cwd, env: {}, rootCodex: true })).toThrow(
      'failed to persist root Codex session id',
    )
  })

  it('fails closed for a malformed ambient Codex thread without changing persisted state', async () => {
    const cwd = await makeTempDir()
    await mkdir(join(cwd, '.local'), { recursive: true })
    await writeFile(sessionPersistPath(cwd, 'codex'), 'codex-existing\n', 'utf8')

    expect(() =>
      resolveSessionId({ cwd, env: { CODEX_THREAD_ID: '../malformed' }, rootCodex: true }),
    ).toThrow('invalid root Codex session id format')
    expect(readPersistedSessionId(cwd, 'codex')).toBe('codex-existing')
  })
})
