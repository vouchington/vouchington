import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempDisposableSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runJscpd } from '../run-jscpd.mts'
import type { JscpdRunContext, ProcessExecutor } from './process.mts'

const JSCPD_BIN = fileURLToPath(new URL('../../node_modules/.bin/jscpd', import.meta.url))
const DUPLICATED_SOURCE = Array.from(
  { length: 30 },
  (_, index) =>
    `export function helper${index}(value: number): number {\n  return value * ${index} + ${index}\n}\n`,
).join('\n')

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=Test User', '-c', 'user.email=tests@example.test', ...args],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
}

function write(cwd: string, file: string, contents = DUPLICATED_SOURCE): void {
  mkdirSync(dirname(join(cwd, file)), { recursive: true })
  writeFileSync(join(cwd, file), contents)
}

// Runs the real jscpd binary where the wrapper asks for `pnpm exec jscpd`, since the temporary
// repository has no package.json of its own.
const realExecutor: ProcessExecutor = (command, args, options) =>
  command === 'pnpm' && args[0] === 'exec' && args[1] === 'jscpd'
    ? spawnSync(JSCPD_BIN, args.slice(2), options)
    : spawnSync(command, args, options)

function run(cwd: string) {
  const logs: string[] = []
  const errors: string[] = []
  const context: JscpdRunContext = {
    cwd,
    env: {},
    execute: realExecutor,
    log: line => logs.push(line),
    error: line => errors.push(line),
  }
  return { status: runJscpd([], context), logs, errors }
}

describe('run-jscpd with the real jscpd binary', () => {
  it('fails only on a clone committed since the merge-base and passes once it is removed', () => {
    using repo = mkdtempDisposableSync(join(tmpdir(), 'run-jscpd-e2e-'))
    const cwd = repo.path
    git(cwd, 'init', '-q', '-b', 'main')
    write(
      cwd,
      '.jscpd.json',
      JSON.stringify({ format: ['typescript'], ignore: ['**/fixtures/**'] }),
    )
    write(cwd, 'src/a.ts')
    git(cwd, 'add', '.')
    git(cwd, 'commit', '-q', '-m', 'base')
    git(cwd, 'update-ref', 'refs/remotes/origin/main', 'HEAD')

    write(cwd, 'sub/dup.ts')
    write(cwd, 'test/fixtures/copy.ts')
    git(cwd, 'add', '.')
    git(cwd, 'commit', '-q', '-m', 'head copies a.ts')
    write(cwd, 'dup.ts')

    const failing = run(cwd)
    expect(failing.status).toBe(1)
    const cloneLines = failing.errors.filter(line => line.startsWith('  '))
    expect(cloneLines).toHaveLength(1)
    expect(cloneLines[0]).toMatch(
      /^ {2}exact (src\/a\.ts|sub\/dup\.ts):\d+-\d+ ~ (src\/a\.ts|sub\/dup\.ts):\d+-\d+ \(\d+ lines\)$/,
    )
    expect(cloneLines[0]).toContain('src/a.ts')
    expect(cloneLines[0]).toContain('sub/dup.ts')

    git(cwd, 'rm', '-q', 'sub/dup.ts')
    git(cwd, 'commit', '-q', '-m', 'dedupe')
    const passing = run(cwd)
    expect(passing.errors).toEqual([])
    expect(passing.status).toBe(0)
    expect(passing.logs).toHaveLength(1)
    expect(passing.logs[0]).toMatch(/^jscpd: no new clones against merge-base [0-9a-f]{12} /)
    expect(git(cwd, 'status', '--porcelain')).toBe('?? dup.ts\n')
  })
})
