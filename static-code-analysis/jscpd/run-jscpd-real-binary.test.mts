import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempDisposableSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runJscpd } from '../run-jscpd.mts'
import type { JscpdRunContext, ProcessExecutor } from './process.mts'

const JSCPD_BIN = fileURLToPath(new URL('../../node_modules/.bin/jscpd', import.meta.url))
const REPO_CONFIG = fileURLToPath(new URL('../../.jscpd.json', import.meta.url))
const DUPLICATED_SOURCE = Array.from(
  { length: 30 },
  (_, index) =>
    `export function helper${index}(value: number): number {\n  return value * ${index} + ${index}\n}\n`,
).join('\n')

// Copies differ in a literal every few lines, so only similarity matching pairs them as a clone.
function nearMissSource(variant: number): string {
  return `export function summarize${variant}(rows: Array<{ id: string; total: number }>): Map<string, number> {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const previous = totals.get(row.id) ?? ${variant}
    if (row.total < ${variant}) {
      throw new Error(\`row ${variant} is invalid: \${row.id}\`)
    }
    totals.set(row.id, previous + row.total)
  }
  const sorted = [...totals.entries()].sort((left, right) => right[1] - left[1] + ${variant})
  const limited = sorted.slice(0, ${25 + variant})
  const result = new Map<string, number>()
  for (const [id, total] of limited) {
    result.set(id, Math.round(total * ${10 ** variant}) / ${10 ** variant})
  }
  if (result.size === ${variant}) {
    console.warn('summary ${variant} is empty')
  }
  return result
}
`
}

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

function commitAll(cwd: string, message: string): void {
  git(cwd, 'add', '.')
  git(cwd, 'commit', '-q', '-m', message)
}

// Commits the config and files as the merge-base that origin/main points to.
function initRepo(cwd: string, config: object, files: Record<string, string>): void {
  git(cwd, 'init', '-q', '-b', 'main')
  write(cwd, '.jscpd.json', JSON.stringify(config))
  for (const [file, contents] of Object.entries(files)) write(cwd, file, contents)
  commitAll(cwd, 'base')
  git(cwd, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
}

// Runs the real jscpd binary where the wrapper asks for `pnpm exec jscpd`, since the temporary
// repository has no package.json of its own.
const realExecutor: ProcessExecutor = (command, args, options) =>
  command === 'pnpm' && args[0] === 'exec' && args[1] === 'jscpd'
    ? spawnSync(JSCPD_BIN, args.slice(2), options)
    : spawnSync(command, args, options)

function run(cwd: string, env: Record<string, string> = {}) {
  const logs: string[] = []
  const errors: string[] = []
  const context: JscpdRunContext = {
    cwd,
    env,
    execute: realExecutor,
    log: line => logs.push(line),
    error: line => errors.push(line),
  }
  const status = runJscpd([], context)
  return { status, logs, errors, cloneLines: errors.filter(line => line.startsWith('  ')) }
}

// Commits the removal of the new copy and returns the summary line of the passing rerun.
function passingSummaryAfterRemoving(cwd: string, file: string): string {
  git(cwd, 'rm', '-q', file)
  git(cwd, 'commit', '-q', '-m', 'dedupe')
  const passing = run(cwd)
  expect(passing.errors).toEqual([])
  expect(passing.status).toBe(0)
  expect(passing.logs).toHaveLength(1)
  return passing.logs[0]
}

describe('run-jscpd with the real jscpd binary', () => {
  it('fails only on a clone committed since the merge-base and passes once it is removed', () => {
    using repo = mkdtempDisposableSync(join(tmpdir(), 'run-jscpd-e2e-'))
    const cwd = repo.path
    initRepo(
      cwd,
      { format: ['typescript'], ignore: ['**/fixtures/**'] },
      { 'src/a.ts': DUPLICATED_SOURCE },
    )
    write(cwd, 'sub/dup.ts')
    write(cwd, 'test/fixtures/copy.ts')
    commitAll(cwd, 'head copies a.ts')
    write(cwd, 'dup.ts')

    const failing = run(cwd)
    expect(failing.status).toBe(1)
    expect(failing.cloneLines).toHaveLength(1)
    expect(failing.cloneLines[0]).toMatch(
      /^ {2}exact (src\/a\.ts|sub\/dup\.ts):\d+-\d+ ~ (src\/a\.ts|sub\/dup\.ts):\d+-\d+ \(\d+ lines\)$/,
    )
    expect(failing.cloneLines[0]).toContain('src/a.ts')
    expect(failing.cloneLines[0]).toContain('sub/dup.ts')

    expect(passingSummaryAfterRemoving(cwd, 'sub/dup.ts')).toMatch(
      /^jscpd: no new clones against merge-base [0-9a-f]{12} /,
    )
    expect(git(cwd, 'status', '--porcelain')).toBe('?? dup.ts\n')
  })

  it('ratchets a pull_request merge commit against its first parent, as on a stack layer', () => {
    using repo = mkdtempDisposableSync(join(tmpdir(), 'run-jscpd-e2e-'))
    const cwd = repo.path
    initRepo(cwd, { format: ['typescript'] }, { 'src/a.ts': DUPLICATED_SOURCE })
    git(cwd, 'checkout', '-q', '-b', 'parent')
    write(cwd, 'src/parent-copy.ts')
    commitAll(cwd, 'the parent layer copies a.ts')
    git(cwd, 'checkout', '-q', '-b', 'layer')
    write(cwd, 'src/layer.ts', 'export const layer = 1\n')
    commitAll(cwd, 'the layer adds no clone')
    git(cwd, 'checkout', '-q', 'parent')
    git(cwd, 'merge', '-q', '--no-ff', '-m', 'Merge layer into parent', 'layer')

    const pullRequest = run(cwd, { GITHUB_EVENT_NAME: 'pull_request' })
    expect(pullRequest.errors).toEqual([])
    expect(pullRequest.status).toBe(0)
    expect(pullRequest.logs).toEqual([
      expect.stringMatching(
        /^jscpd: no new clones against pull request merge parent [0-9a-f]{12} \(HEAD\^1\); /,
      ),
    ])
    const againstMain = run(cwd)
    expect(againstMain.status).toBe(1)
    expect(againstMain.errors.join('\n')).toContain('src/parent-copy.ts')
  })

  it('fails on a new near-miss clone at the configured similarity, not on one the base has', () => {
    const { similarity } = JSON.parse(readFileSync(REPO_CONFIG, 'utf8')) as { similarity: number }
    using repo = mkdtempDisposableSync(join(tmpdir(), 'run-jscpd-e2e-'))
    const cwd = repo.path
    initRepo(
      cwd,
      { format: ['typescript'], similarity },
      { 'src/a.ts': nearMissSource(1), 'src/b.ts': nearMissSource(2) },
    )
    write(cwd, 'src/c.ts', nearMissSource(3))
    commitAll(cwd, 'head adds a near-miss copy')

    const failing = run(cwd)
    expect(failing.status).toBe(1)
    expect(failing.cloneLines.length).toBeGreaterThan(0)
    for (const line of failing.cloneLines) {
      expect(line).toMatch(/^ {2}similar src\/[abc]\.ts:\d+-\d+ ~ src\/[abc]\.ts:\d+-\d+ /)
      expect(line).toContain('src/c.ts')
    }

    expect(passingSummaryAfterRemoving(cwd, 'src/c.ts')).toMatch(
      /; 2 files scanned, [1-9]\d* existing clones\.$/,
    )
  })
})
