import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const scriptPath = fileURLToPath(new URL('../../retrospective-distill.mts', import.meta.url))
const testDirs: string[] = []

async function makePartitionFile(lines: unknown[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'retrospective-distill-cli-'))
  testDirs.push(dir)
  const path = join(dir, 'partition.jsonl')
  await writeFile(path, `${lines.map(line => JSON.stringify(line)).join('\n')}\n`, 'utf8')
  return path
}

describe('retrospective-distill CLI', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('prints inert help for -h and --help', async () => {
    for (const args of [['-h'], ['--help']]) {
      const result = await execFileAsync(process.execPath, [scriptPath, ...args])
      expect(result.stdout).toContain('Usage:')
    }
  })

  it('rejects a missing positional argument with exit code 1 and an error on stderr', async () => {
    const rejection = await execFileAsync(process.execPath, [
      scriptPath,
      '--retro-cutoff',
      '2026-08-01T00:00:00.000Z',
      '--session-cutoff',
      '2026-08-15T00:00:00.000Z',
    ]).then(
      () => {
        throw new Error('expected the process to exit nonzero')
      },
      (error: unknown) => error,
    )
    expect(rejection).toMatchObject({ code: 1 })
    expect(String((rejection as { stderr: string }).stderr)).toContain(
      'expected exactly one positional argument',
    )
  })

  it('classifies a real partition file end to end, with no MCP or network access', async () => {
    const path = await makePartitionFile([
      {
        type: 'session',
        session: {
          id: 'sess-1',
          agent: 'claude',
          version: '1',
          parentSessionId: null,
          createdAt: '2026-07-01T00:00:00.000Z',
          lastEntryAt: '2026-07-01T00:00:00.000Z',
          archivedAt: null,
          data: {},
        },
      },
      {
        type: 'entry',
        entry: {
          sessionId: 'sess-1',
          createdAt: '2026-07-01T00:00:00.000Z',
          data: { type: 'journal', markdown: '# note' },
        },
      },
      { type: 'manifest', manifest: { schemaVersion: 1, status: 'complete' } },
    ])

    const result = await execFileAsync(process.execPath, [
      scriptPath,
      path,
      '--retro-cutoff',
      '2026-08-01T00:00:00.000Z',
      '--session-cutoff',
      '2026-08-15T00:00:00.000Z',
    ])

    expect(result.stdout).toBe('sess-1\tjournal-only\teligible\n')
  })
})
