import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const scriptPath = fileURLToPath(new URL('./check-fresh-base', import.meta.url))
const testDirs: string[] = []

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function commit(cwd: string, file: string, contents: string) {
  writeFileSync(join(cwd, file), contents)
  git(cwd, 'add', file)
  git(cwd, 'commit', '-m', `update ${file}`)
}

function makeRepo({ withOriginMain = true } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'voucha-check-fresh-base-'))
  testDirs.push(cwd)

  git(cwd, 'init', '-b', 'main')
  git(cwd, 'config', 'user.email', 'tests+fresh-base@voucha.ai')
  git(cwd, 'config', 'user.name', 'Test User')
  commit(cwd, 'tracked.txt', 'initial\n')
  if (withOriginMain) git(cwd, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  git(cwd, 'switch', '-c', 'feature')

  return cwd
}

function moveOriginMainAhead(cwd: string) {
  git(cwd, 'switch', 'main')
  commit(cwd, 'main.txt', 'new on main\n')
  git(cwd, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  git(cwd, 'switch', 'feature')
}

function runCheck(
  cwd: string,
  { input = '{}', skipFetch = true }: { input?: string; skipFetch?: boolean } = {},
) {
  const env = { ...process.env }
  if (skipFetch) env.CHECK_FRESH_BASE_SKIP_FETCH = '1'
  else delete env.CHECK_FRESH_BASE_SKIP_FETCH

  return spawnSync('/bin/bash', [scriptPath], {
    cwd,
    encoding: 'utf8',
    env,
    input,
    timeout: 10_000,
  })
}

function additionalContext(stdout: string) {
  const output = JSON.parse(stdout) as {
    hookSpecificOutput: { additionalContext: string; hookEventName: string }
  }
  expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart')
  return output.hookSpecificOutput.additionalContext
}

describe('dev/check-fresh-base', () => {
  afterEach(() => {
    for (const dir of testDirs.splice(0)) rmSync(dir, { force: true, recursive: true })
  })

  it('stays silent when HEAD matches origin/main', () => {
    const result = runCheck(makeRepo())

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })

  it('classifies a clean branch that is behind origin/main', () => {
    const cwd = makeRepo()
    moveOriginMainAhead(cwd)

    const result = runCheck(cwd)
    const context = additionalContext(result.stdout)

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(context).toContain('branch `feature` is behind `origin/main`')
    expect(context).toContain('0 ahead, 1 behind')
    expect(context).toContain('working tree is clean')
    expect(context).toContain('For a new task in Plan Mode')
  })

  it('classifies a clean branch that is ahead of origin/main', () => {
    const cwd = makeRepo()
    commit(cwd, 'feature.txt', 'new on feature\n')

    const context = additionalContext(runCheck(cwd).stdout)

    expect(context).toContain('branch `feature` is ahead of `origin/main`')
    expect(context).toContain('1 ahead, 0 behind')
    expect(context).toContain('For resumed work')
  })

  it('classifies a clean branch that has diverged from origin/main', () => {
    const cwd = makeRepo()
    commit(cwd, 'feature.txt', 'new on feature\n')
    moveOriginMainAhead(cwd)

    const context = additionalContext(runCheck(cwd).stdout)

    expect(context).toContain('branch `feature` has diverged from `origin/main`')
    expect(context).toContain('1 ahead, 1 behind')
    expect(context).toContain('inspect relevant files from `origin/main`')
  })

  it('reports dirty state without suggesting a forced reset', () => {
    const cwd = makeRepo()
    writeFileSync(join(cwd, 'untracked.txt'), 'dirty\n')

    const context = additionalContext(runCheck(cwd).stdout)

    expect(context).toContain('branch `feature` matches `origin/main`')
    expect(context).toContain('working tree is dirty')
    expect(context).toContain('ask whether this is new or resumed work')
    expect(context).toContain('Never infer `--force`')
  })

  it('reports an unknown base when origin/main is unavailable', () => {
    const context = additionalContext(runCheck(makeRepo({ withOriginMain: false })).stdout)

    expect(context).toContain('`origin/main` is unavailable')
    expect(context).toContain('freshness is unknown')
    expect(context).toContain('Retry `git fetch origin`')
  })

  it('reports that freshness is unknown when fetch fails', () => {
    const cwd = makeRepo()
    git(cwd, 'remote', 'add', 'origin', join(cwd, 'missing-origin'))

    const context = additionalContext(runCheck(cwd, { skipFetch: false }).stdout)

    expect(context).toContain('refresh of `origin/main` failed')
    expect(context).toContain('freshness is unknown')
    expect(context).toContain('Retry `git fetch origin`')
  })

  it('stays silent for a compact session restart', () => {
    const result = runCheck(makeRepo(), { input: JSON.stringify({ source: 'compact' }) })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })
})
