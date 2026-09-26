import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  cursorPayloadSessionId,
  persistHookRealSessionId,
  persistHookSessionStart,
  persistRealSessionId,
  readPersistedSessionId,
  resolveAndPersistRootCodexSessionId,
  resolveAndPersistSessionStartId,
  sessionPersistPath,
} from './persist.mts'

const testDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'agent-session-id-'))
  testDirs.push(dir)
  return dir
}

async function readPersist(cwd: string, agent: 'cursor' | 'grok'): Promise<string> {
  return (await readFile(sessionPersistPath(cwd, agent), 'utf8')).trim()
}

describe('agent-session-id persist', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  describe('cursorPayloadSessionId', () => {
    it('prefers session_id over conversation_id', () => {
      expect(cursorPayloadSessionId({ conversation_id: 'conv-1', session_id: ' sess-1 ' })).toBe(
        'sess-1',
      )
    })

    it('reads conversation_id when session_id is absent', () => {
      expect(cursorPayloadSessionId({ conversation_id: 'conv-1' })).toBe('conv-1')
    })

    it('rejects invalid tokens', () => {
      expect(cursorPayloadSessionId({ session_id: '../etc/passwd' })).toBe('')
    })
  })

  describe('resolveAndPersistSessionStartId', () => {
    it('writes a real payload id and overwrites a generated id', async () => {
      const cwd = await makeTempDir()
      const generated = resolveAndPersistSessionStartId({
        agent: 'cursor',
        cwd,
        generateId: () => 'cursor-generated',
        payloadId: '',
      })
      expect(generated).toEqual({ generated: true, sessionId: 'cursor-generated' })
      expect(await readPersist(cwd, 'cursor')).toBe('cursor-generated')

      const real = resolveAndPersistSessionStartId({
        agent: 'cursor',
        cwd,
        generateId: () => 'cursor-other',
        payloadId: 'real-id',
      })
      expect(real).toEqual({ generated: false, sessionId: 'real-id' })
      expect(await readPersist(cwd, 'cursor')).toBe('real-id')
    })

    it('reuses a valid persist file and never overwrites it with a generated id', async () => {
      const cwd = await makeTempDir()
      await mkdir(join(cwd, '.local'), { recursive: true })
      await writeFile(sessionPersistPath(cwd, 'cursor'), 'cursor-existing\n', 'utf8')
      const reused = resolveAndPersistSessionStartId({
        agent: 'cursor',
        cwd,
        generateId: () => 'cursor-new',
        payloadId: '',
      })
      expect(reused).toEqual({ generated: false, sessionId: 'cursor-existing' })
      expect(await readPersist(cwd, 'cursor')).toBe('cursor-existing')
    })

    it('rejects an invalid persist file and generates a replacement', async () => {
      const cwd = await makeTempDir()
      await mkdir(join(cwd, '.local'), { recursive: true })
      await writeFile(sessionPersistPath(cwd, 'cursor'), '../etc/passwd\n', 'utf8')
      const generated = resolveAndPersistSessionStartId({
        agent: 'cursor',
        cwd,
        generateId: () => 'cursor-fixed',
        payloadId: '',
      })
      expect(generated).toEqual({ generated: true, sessionId: 'cursor-fixed' })
      expect(await readPersist(cwd, 'cursor')).toBe('cursor-fixed')
    })
  })

  describe('resolveAndPersistRootCodexSessionId', () => {
    it('does not invoke generation when a real Codex thread id is available', async () => {
      const cwd = await makeTempDir()
      expect(
        resolveAndPersistRootCodexSessionId({
          cwd,
          generateId: () => {
            throw new Error('generation must be lazy')
          },
          payloadId: 'real-codex-thread',
        }),
      ).toEqual({ generated: false, sessionId: 'real-codex-thread' })
    })

    it('normalizes whitespace around a real Codex thread id', async () => {
      const cwd = await makeTempDir()
      expect(
        resolveAndPersistRootCodexSessionId({
          cwd,
          payloadId: '  real-codex-thread  ',
        }),
      ).toEqual({ generated: false, sessionId: 'real-codex-thread' })
      expect(readPersistedSessionId(cwd, 'codex')).toBe('real-codex-thread')
    })

    it('does not invoke generation when a persisted Codex id is available', async () => {
      const cwd = await makeTempDir()
      persistRealSessionId(cwd, 'codex', 'codex-existing')
      expect(
        resolveAndPersistRootCodexSessionId({
          cwd,
          generateId: () => {
            throw new Error('generation must be lazy')
          },
          payloadId: undefined,
        }),
      ).toEqual({ generated: false, sessionId: 'codex-existing' })
    })

    it('fails closed on malformed Codex persistence outside an explicit rotation', async () => {
      const cwd = await makeTempDir()
      await mkdir(join(cwd, '.local'), { recursive: true })
      await writeFile(sessionPersistPath(cwd, 'codex'), '../malformed\n', 'utf8')
      expect(() => resolveAndPersistRootCodexSessionId({ cwd })).toThrow(
        'failed to persist root Codex session id',
      )
    })
  })

  describe('persistRealSessionId', () => {
    it('does not generate when the payload id is missing', async () => {
      const cwd = await makeTempDir()
      persistRealSessionId(cwd, 'cursor', '')
      expect(readPersistedSessionId(cwd, 'cursor')).toBeUndefined()
    })
  })

  describe('hook runtime persist', () => {
    it.each(['claude', 'codex', undefined] as const)('is a no-op for runtime %s', async runtime => {
      const cwd = await makeTempDir()
      const payload = { sessionId: 'payload-id' }
      const env = { GROK_SESSION_ID: 'grok-env' }
      expect(persistHookSessionStart(runtime, payload, env, cwd)).toBeUndefined()
      persistHookRealSessionId(runtime, payload, env, cwd)
      expect(readPersistedSessionId(cwd, 'cursor')).toBeUndefined()
      expect(readPersistedSessionId(cwd, 'grok')).toBeUndefined()
    })

    it.each([
      ['grok', 'grok-generated'],
      ['cursor', 'cursor-generated'],
    ] as const)('%s SessionStart generates when no payload id exists', async (runtime, id) => {
      const cwd = await makeTempDir()
      expect(persistHookSessionStart(runtime, {}, {}, cwd, () => id)).toEqual({
        generated: true,
        sessionId: id,
      })
      expect(await readPersist(cwd, runtime)).toBe(id)
    })

    it('Grok SessionStart persists a real id and PreToolUse does not generate', async () => {
      const cwd = await makeTempDir()
      expect(persistHookSessionStart('grok', { sessionId: 'grok-real' }, {}, cwd)).toEqual({
        generated: false,
        sessionId: 'grok-real',
      })
      expect(await readPersist(cwd, 'grok')).toBe('grok-real')

      persistHookRealSessionId('grok', {}, { GROK_SESSION_ID: 'grok-env' }, cwd)
      expect(await readPersist(cwd, 'grok')).toBe('grok-env')

      persistHookRealSessionId('grok', {}, {}, cwd)
      expect(await readPersist(cwd, 'grok')).toBe('grok-env')
    })

    it('Cursor SessionStart persists session_id and PreToolUse falls back to conversation_id', async () => {
      const cwd = await makeTempDir()
      expect(persistHookSessionStart('cursor', { session_id: 'cursor-real' }, {}, cwd)).toEqual({
        generated: false,
        sessionId: 'cursor-real',
      })
      expect(await readPersist(cwd, 'cursor')).toBe('cursor-real')

      persistHookRealSessionId('cursor', { conversation_id: 'cursor-conv' }, {}, cwd)
      expect(await readPersist(cwd, 'cursor')).toBe('cursor-conv')

      persistHookRealSessionId('cursor', {}, {}, cwd)
      expect(await readPersist(cwd, 'cursor')).toBe('cursor-conv')
    })

    it('does not cross-read cursor and grok persist files', async () => {
      const cwd = await makeTempDir()
      persistRealSessionId(cwd, 'cursor', 'cursor-only')
      persistRealSessionId(cwd, 'grok', 'grok-only')
      expect(readPersistedSessionId(cwd, 'cursor')).toBe('cursor-only')
      expect(readPersistedSessionId(cwd, 'grok')).toBe('grok-only')
    })
  })
})
