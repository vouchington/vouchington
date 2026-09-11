import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const scriptPath = fileURLToPath(new URL('./journal-checkpoint.mts', import.meta.url))
const testDirs: string[] = []

// SANDBOX_RUNTIME=1 is the documented skip guard checked first in
// dev/journal-checkpoint/append.mts, before any credential check or network attempt — using it
// here keeps this subprocess test fully offline and deterministic regardless of whatever real
// AGENT_BLACKBOARD_URL/AGENT_BLACKBOARD_TOKEN happen to be set in the ambient environment.
const SANDBOXED_ENV = { SANDBOX_RUNTIME: '1' }

async function makeTranscript(lines: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'journal-checkpoint-e2e-'))
  testDirs.push(dir)
  const path = join(dir, 'transcript.jsonl')
  await writeFile(path, `${lines.join('\n')}\n`, 'utf8')
  return path
}

function runScript({
  args = [],
  input = '',
  env = {},
}: { args?: string[]; input?: string; env?: NodeJS.ProcessEnv } = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    input,
    timeout: 10_000,
  })
}

describe('dev/journal-checkpoint.mts (hook subprocess)', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('is a no-op with no mode argument', () => {
    const result = runScript({ input: JSON.stringify({ session_id: 'sess-1' }) })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })

  it('is a no-op for an unrecognized mode argument', () => {
    const result = runScript({ args: ['bogus'], input: JSON.stringify({ session_id: 'sess-1' }) })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })

  it('is a no-op for malformed JSON on stdin', () => {
    const result = runScript({ args: ['compact'], input: 'not valid json{{{' })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })

  it('is a no-op for a blank session id', () => {
    const result = runScript({ args: ['compact'], input: JSON.stringify({ source: 'compact' }) })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })

  it('is a no-op in compact mode when source is not "compact"', () => {
    const result = runScript({
      args: ['compact'],
      input: JSON.stringify({ session_id: 'sess-1', source: 'startup' }),
    })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })

  it('runs the full compact-checkpoint pipeline and stays silent under SANDBOX_RUNTIME', async () => {
    const transcriptPath = await makeTranscript([
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: 'do the thing' },
        uuid: 'u1',
      }),
    ])
    const result = runScript({
      args: ['compact'],
      env: SANDBOXED_ENV,
      input: JSON.stringify({
        session_id: 'sess-1',
        source: 'compact',
        transcript_path: transcriptPath,
      }),
    })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })

  it('stays silent when compact is invoked with a Codex runtime argv', async () => {
    const transcriptPath = await makeTranscript([
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: 'do the thing' },
        uuid: 'u1',
      }),
    ])
    const result = runScript({
      args: ['compact', 'codex'],
      env: SANDBOXED_ENV,
      input: JSON.stringify({
        session_id: 'sess-1',
        source: 'compact',
        transcript_path: transcriptPath,
      }),
    })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })

  it('ships the compact hook command with an explicit runtime argv', () => {
    const repoRoot = fileURLToPath(new URL('..', import.meta.url))
    const codex = readFileSync(join(repoRoot, '.codex/config.toml'), 'utf8')
    const claude = readFileSync(join(repoRoot, '.claude/settings.json'), 'utf8')
    expect(codex).toContain('dev/journal-checkpoint.mts" compact codex')
    expect(claude).toContain('dev/journal-checkpoint.mts\\" compact claude')
  })
})
