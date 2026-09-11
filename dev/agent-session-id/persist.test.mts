import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  cursorPayloadSessionId,
  persistGrokRealSessionId,
  persistGrokSessionStart,
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

  describe('grok persist', () => {
    it('is a no-op without GROK_SESSION_ID or GROK_HOOK_EVENT', async () => {
      const cwd = await makeTempDir()
      expect(persistGrokSessionStart({ sessionId: 'grok-payload' }, {}, cwd)).toBeUndefined()
      persistGrokRealSessionId({ sessionId: 'grok-payload' }, {}, cwd)
      expect(readPersistedSessionId(cwd, 'grok')).toBeUndefined()
    })

    it('SessionStart generates when gated and no payload id exists', async () => {
      const cwd = await makeTempDir()
      expect(
        persistGrokSessionStart(
          {},
          { GROK_HOOK_EVENT: 'SessionStart' },
          cwd,
          () => 'grok-generated',
        ),
      ).toEqual({ generated: true, sessionId: 'grok-generated' })
      expect(await readPersist(cwd, 'grok')).toBe('grok-generated')
    })

    it('SessionStart persists a real Grok id and PreToolUse does not generate', async () => {
      const cwd = await makeTempDir()
      expect(
        persistGrokSessionStart(
          { sessionId: 'grok-real' },
          { GROK_HOOK_EVENT: 'SessionStart' },
          cwd,
        ),
      ).toEqual({ generated: false, sessionId: 'grok-real' })
      expect(await readPersist(cwd, 'grok')).toBe('grok-real')

      persistGrokRealSessionId({}, { GROK_SESSION_ID: 'grok-env' }, cwd)
      expect(await readPersist(cwd, 'grok')).toBe('grok-env')

      persistGrokRealSessionId({}, { GROK_HOOK_EVENT: 'PreToolUse' }, cwd)
      expect(await readPersist(cwd, 'grok')).toBe('grok-env')
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
