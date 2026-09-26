import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { defaultBlackboardAgent, requireBlackboardAgent } from './resolve.mts'

const testDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'retrospective-transcript-facts-agent-'))
  testDirs.push(dir)
  return dir
}

describe('defaultBlackboardAgent hints', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('selects Codex from runtime argv even when CODEX_THREAD_ID is absent', async () => {
    const cwd = await makeTempDir()
    expect(defaultBlackboardAgent({}, cwd, { runtime: 'codex' })).toBe('codex')
    expect(defaultBlackboardAgent({}, cwd, { runtime: 'claude' })).toBe('claude-code')
  })

  it('selects Cursor from a resolved cursor runtime', async () => {
    const cwd = await makeTempDir()
    expect(defaultBlackboardAgent({}, cwd, { runtime: 'cursor' })).toBe('cursor')
  })

  it('keeps Grok hook env ahead of a Claude-compat runtime argv', async () => {
    const cwd = await makeTempDir()
    expect(defaultBlackboardAgent({ GROK_SESSION_ID: 'g' }, cwd, { runtime: 'claude' })).toBe(
      'grok',
    )
    expect(
      defaultBlackboardAgent({ GROK_HOOK_EVENT: 'SessionStart' }, cwd, { runtime: 'claude' }),
    ).toBe('grok')
  })

  it('does not let a leaked GROK_AGENT override an explicit Codex runtime', async () => {
    const cwd = await makeTempDir()
    expect(defaultBlackboardAgent({ GROK_AGENT: 'grok-build' }, cwd, { runtime: 'codex' })).toBe(
      'codex',
    )
    expect(defaultBlackboardAgent({ GROK_AGENT: 'grok-build' }, cwd)).toBe('grok')
  })

  it('selects Codex from a rollout transcript path when env has no thread id', async () => {
    const cwd = await makeTempDir()
    expect(
      defaultBlackboardAgent({}, cwd, {
        transcriptPath: join(cwd, '.codex', 'sessions', 'rollout-2026-08-23-thread-1.jsonl'),
      }),
    ).toBe('codex')
    expect(
      defaultBlackboardAgent({}, cwd, {
        transcriptPath: '/Users/someone/.codex/sessions/2026/08/23/thread.jsonl',
      }),
    ).toBe('codex')
    expect(
      defaultBlackboardAgent({}, cwd, {
        transcriptPath: '/Users/someone/.grok/sessions/repo/sess-1/updates.jsonl',
      }),
    ).toBe('grok')
    expect(
      defaultBlackboardAgent({}, cwd, { transcriptPath: join(cwd, 'updates.jsonl') }),
    ).toBeUndefined()
    expect(
      defaultBlackboardAgent({}, cwd, {
        transcriptPath: '/Users/someone/.claude/projects/-repo/sess-1.jsonl',
      }),
    ).toBe('claude-code')
    expect(
      defaultBlackboardAgent({}, cwd, { transcriptPath: join(cwd, 'transcript.jsonl') }),
    ).toBeUndefined()
    expect(
      defaultBlackboardAgent({}, cwd, {
        transcriptPath: join(cwd, 'rollout-2026-08-23-thread-1.jsonl'),
      }),
    ).toBeUndefined()
  })

  it('does not guess claude-code when no identity signal is present', async () => {
    const cwd = await makeTempDir()
    expect(defaultBlackboardAgent({}, cwd)).toBeUndefined()
    expect(() => requireBlackboardAgent({}, cwd)).toThrow(/no blackboard agent identity/)
  })
})
