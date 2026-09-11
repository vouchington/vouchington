import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  resolveSubagentJsonlPaths,
  resolveTranscriptFile,
  resolveTranscriptSessionId,
} from '../resolve.mts'

const testDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'retrospective-transcript-facts-'))
  testDirs.push(dir)
  return dir
}

describe('transcript session resolution', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('keeps transcript lookup order distinct from Blackboard identity policy', () => {
    expect(
      resolveTranscriptSessionId({
        env: {
          CLAUDE_CODE_SESSION_ID: 'claude',
          CODEX_THREAD_ID: 'codex',
          CURSOR_SESSION_ID: 'cursor',
          GROK_SESSION_ID: 'grok',
        },
      }),
    ).toBe('codex')
  })

  it('prefers explicit, then Codex, then Claude session ids', () => {
    const env = { CODEX_THREAD_ID: 'codex', CLAUDE_CODE_SESSION_ID: 'claude' }
    expect(resolveTranscriptSessionId({ sessionIdArg: 'explicit', env })).toBe('explicit')
    expect(resolveTranscriptSessionId({ env })).toBe('codex')
    expect(resolveTranscriptSessionId({ env: { CLAUDE_CODE_SESSION_ID: 'claude' } })).toBe('claude')
  })
})

describe('resolveTranscriptFile', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('searches explicit session ids across Codex and Claude roots', async () => {
    const root = await makeTempDir()
    const codexDir = join(root, 'codex')
    const claudeDir = join(root, 'claude', 'project')
    await mkdir(join(codexDir, '2026', '07', '13'), { recursive: true })
    await mkdir(claudeDir, { recursive: true })
    const codexPath = join(codexDir, '2026', '07', '13', 'rollout-date-same-id.jsonl')
    await writeFile(codexPath, '{}\n', 'utf8')
    await writeFile(join(claudeDir, 'same-id.jsonl'), '{}\n', 'utf8')
    expect(
      resolveTranscriptFile({
        sessionIdArg: 'same-id',
        codexSessionsDir: codexDir,
        projectsDir: join(root, 'claude'),
      }),
    ).toEqual({ path: codexPath, sessionId: 'same-id' })
  })

  it('finds nested Codex rollout files by thread id', async () => {
    const root = await makeTempDir()
    const nested = join(root, '2026', '07', '13')
    await mkdir(nested, { recursive: true })
    const path = join(nested, 'rollout-2026-child-id.jsonl')
    await writeFile(path, '{}\n', 'utf8')
    expect(
      resolveTranscriptFile({
        sessionIdArg: 'child-id',
        codexSessionsDir: root,
        projectsDir: join(root, 'claude'),
      }),
    ).toEqual({ path, sessionId: 'child-id' })
  })

  it('returns an error when no session id is resolvable', () => {
    expect(resolveTranscriptFile({ env: {} })).toMatchObject({
      error: expect.stringContaining('no session id'),
    })
  })

  it('finds a Grok updates.jsonl under the encoded cwd session directory', async () => {
    const root = await makeTempDir()
    const cwd = '/repo/worktree'
    const sessionDir = join(root, encodeURIComponent(cwd), 'grok-sess')
    await mkdir(sessionDir, { recursive: true })
    const transcriptPath = join(sessionDir, 'updates.jsonl')
    await writeFile(transcriptPath, '{}\n', 'utf8')
    expect(
      resolveTranscriptFile({
        sessionIdArg: 'grok-sess',
        grokSessionsDir: root,
        cwd,
        codexSessionsDir: join(root, 'codex-empty'),
        projectsDir: join(root, 'claude-empty'),
      }),
    ).toEqual({ path: transcriptPath, sessionId: 'grok-sess' })
  })

  it('bypasses session/glob resolution entirely via --jsonl', () => {
    expect(resolveTranscriptFile({ jsonlPath: '/some/fixture.jsonl', env: {} })).toEqual({
      path: '/some/fixture.jsonl',
      sessionId: 'fixture',
    })
  })

  it('uses unknown for a --jsonl path whose basename has no session id', () => {
    expect(resolveTranscriptFile({ jsonlPath: '/', env: {} })).toEqual({
      path: '/',
      sessionId: 'unknown',
    })
  })

  it('honors an explicit session id alongside --jsonl', () => {
    expect(
      resolveTranscriptFile({ jsonlPath: '/some/fixture.jsonl', sessionIdArg: 'sess-1' }),
    ).toEqual({ path: '/some/fixture.jsonl', sessionId: 'sess-1' })
  })

  it('finds the transcript by globbing <projectsDir>/*/<sessionId>.jsonl', async () => {
    const projectsDir = await makeTempDir()
    const projectDir = join(projectsDir, '-Users-someone-project')
    await mkdir(projectDir, { recursive: true })
    const transcriptPath = join(projectDir, 'sess-42.jsonl')
    await writeFile(transcriptPath, '{}\n', 'utf8')
    expect(resolveTranscriptFile({ sessionIdArg: 'sess-42', projectsDir })).toEqual({
      path: transcriptPath,
      sessionId: 'sess-42',
    })
  })

  it('returns an error when the transcript cannot be found or id is unsafe', async () => {
    const projectsDir = await makeTempDir()
    expect(resolveTranscriptFile({ sessionIdArg: 'missing-session', projectsDir })).toMatchObject({
      error: expect.stringContaining('no transcript found'),
    })
    expect(resolveTranscriptFile({ sessionIdArg: '../../etc/passwd', projectsDir })).toMatchObject({
      error: expect.stringContaining('invalid session id format'),
    })
  })

  it('defaults to the Claude projects directory when no root override is given', () => {
    expect(
      resolveTranscriptFile({ sessionIdArg: 'definitely-not-a-real-session-id-xyz' }),
    ).toMatchObject({
      error: expect.stringContaining('.claude/projects'),
    })
  })
})

describe('resolveSubagentJsonlPaths', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('finds sibling subagent jsonl files under <session-dir>/subagents/', async () => {
    const projectsDir = await makeTempDir()
    const mainJsonlPath = join(projectsDir, 'sess-42.jsonl')
    const subagentsDir = join(projectsDir, 'sess-42', 'subagents')
    await mkdir(subagentsDir, { recursive: true })
    const subagentPath = join(subagentsDir, 'agent-1.jsonl')
    await writeFile(subagentPath, '{}\n', 'utf8')
    expect(resolveSubagentJsonlPaths(mainJsonlPath)).toEqual([subagentPath])
  })

  it('returns an empty array when no sibling subagents directory exists', async () => {
    const projectsDir = await makeTempDir()
    expect(resolveSubagentJsonlPaths(join(projectsDir, 'sess-42.jsonl'))).toEqual([])
  })
})
