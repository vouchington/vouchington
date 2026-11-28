import { spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const fixtures = resolve(import.meta.dirname, 'run-impacted-checks-fixtures')
const runner = resolve(import.meta.dirname, 'run-impacted-checks.mts')

let template: string
let repo: string

function git(...args: string[]) {
  return gitIn(repo, ...args)
}

function gitIn(cwd: string, ...args: string[]) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  expect(result.status).toBe(0)
}

function run(env: Record<string, string> = {}) {
  const log = join(repo, 'pnpm.log')
  const result = spawnSync('node', [runner], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
      PATH: `${join(fixtures, 'bin')}:${process.env.PATH ?? ''}`,
      PNPM_LOG: log,
    },
  })
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []
  return { status: result.status, calls }
}

describe('run-impacted-checks', () => {
  // Built once: each test copies it, so the per-test hook spawns no processes.
  beforeAll(() => {
    template = mkdtempSync(join(tmpdir(), 'voucha-impacted-checks-template-'))
    gitIn(template, 'init', '-q', '-b', 'work')
    copyFileSync(join(fixtures, 'removed.mts.fixture'), join(template, 'removed.mts'))
    gitIn(template, 'add', '.')
    gitIn(
      template,
      '-c',
      'user.email=tests+impacted-checks@voucha.ai',
      '-c',
      'user.name=Test',
      'commit',
      '-q',
      '-m',
      'base',
    )
    gitIn(template, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  })

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'voucha-impacted-checks-'))
    cpSync(template, repo, { recursive: true })
  })

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true })
  })

  afterAll(() => {
    rmSync(template, { recursive: true, force: true })
  })

  it('runs nothing when nothing changed', () => {
    expect(run()).toEqual({ status: 0, calls: [] })
  })

  it('runs only the formatter for a docs-only change', () => {
    copyFileSync(join(fixtures, 'notes.md.fixture'), join(repo, 'notes.md'))
    expect(run()).toEqual({
      status: 0,
      calls: ['exec oxfmt --check --no-error-on-unmatched-pattern notes.md'],
    })
  })

  it('lints and formats changed TypeScript, skipping deleted files', () => {
    copyFileSync(join(fixtures, 'changed.mts.fixture'), join(repo, 'changed.mts'))
    copyFileSync(join(fixtures, 'notes.md.fixture'), join(repo, 'notes.md'))
    rmSync(join(repo, 'removed.mts'))
    expect(run()).toEqual({
      status: 0,
      calls: [
        'exec oxlint --type-aware --deny-warnings --no-error-on-unmatched-pattern changed.mts',
        'exec oxfmt --check --no-error-on-unmatched-pattern changed.mts notes.md',
      ],
    })
  })

  it('runs every check, then exits 1 when one fails', () => {
    copyFileSync(join(fixtures, 'changed.mts.fixture'), join(repo, 'changed.mts'))
    const result = run({ FAIL_TOOL: 'oxlint' })
    expect(result.status).toBe(1)
    expect(result.calls).toHaveLength(2)
  })

  it('exits 2 when the changed files cannot be determined', () => {
    git('update-ref', '-d', 'refs/remotes/origin/main')
    expect(run().status).toBe(2)
  })
})
