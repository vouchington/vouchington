import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  makeTempRepo,
  removeTempRepos,
  runGit,
  writeRepoFile,
} from '../test-helpers/knip-production-exports/temp-repo.mts'
import { parseBaseline, serializeBaseline } from './baseline.mts'
import { BASELINE_PATH, UPDATE_COMMAND } from './config.mts'
import { createDeps } from './deps.mts'
import { main, parseMode } from './main.mts'

const TEST_FILE = 'backend/pkg/thing.test.mts'
const FAKE_KNIP = 'tools/fake-knip.mjs'
// Reports an extra export only while the test file exists, like a test-only import would.
const REPORTS_KEPT = `
import { existsSync } from 'node:fs'
const extra = existsSync('${TEST_FILE}') ? ['leakedByTest'] : []
const exports = [...extra, 'kept'].map(name => ({ name }))
console.log(JSON.stringify({ issues: [{ file: 'backend/pkg/a.mts', exports, types: [] }] }))
`
const CRASHES = 'console.error("ERROR: Invalid input"); process.exit(2)'
const baselineFor = (...names: string[]) =>
  serializeBaseline(names.map(symbol => ({ file: 'backend/pkg/a.mts', symbol, type: 'exports' })))

function repoWith(knipSource: string, baseline?: string) {
  const dir = makeTempRepo({
    [FAKE_KNIP]: knipSource,
    [TEST_FILE]: 'test\n',
    'backend/pkg/a.mts': 'export const kept = 1\n',
    'static-code-analysis/knip-production-exports/keep': 'x\n',
    ...(baseline === undefined ? {} : { [BASELINE_PATH]: baseline }),
  })
  return { dir, knip: { args: [], bin: join(dir, FAKE_KNIP) }, root: dir }
}

function captured(options: ReturnType<typeof repoWith>) {
  const output: string[] = []
  const push = (text: string) => output.push(text)
  return { options: { ...options, error: push, info: push }, text: () => output.join('\n') }
}

const abort = () => new AbortController().signal

const cleanup = () => {
  removeTempRepos()
  vi.restoreAllMocks()
}

describe('parseMode', () => {
  it('checks by default and rewrites only for --update', () => {
    expect(parseMode([])).toBe('check')
    expect(parseMode(['--update'])).toBe('update')
  })

  it.each([['--nope'], ['extra']])('rejects %s', arg => {
    expect(() => parseMode([arg])).toThrow(arg)
  })
})

describe('main', () => {
  afterEach(cleanup)

  it('passes when knip, run without the test files, matches the baseline', async () => {
    const repo = repoWith(REPORTS_KEPT, baselineFor('kept'))
    const { options, text } = captured(repo)
    expect(await main([], options)).toBe(0)
    expect(text()).toContain('temporarily removed 1 tracked test files')
    expect(text()).toContain('1 known findings')
    expect(existsSync(join(repo.dir, TEST_FILE))).toBe(true)
    expect(runGit(repo.dir, 'status', '--porcelain')).toBe('')
  })

  it('fails on a new finding and leaves the tree as it found it', async () => {
    const repo = repoWith(REPORTS_KEPT, baselineFor())
    const { options, text } = captured(repo)
    expect(await main([], options)).toBe(1)
    expect(text()).toContain('New findings (1)')
    expect(runGit(repo.dir, 'status', '--porcelain')).toBe('')
  })

  it('rewrites the baseline for --update, formatted and readable', async () => {
    const repo = repoWith(REPORTS_KEPT, baselineFor('old', 'other'))
    expect(await main(['--update'], captured(repo).options)).toBe(0)
    const written = readFileSync(join(repo.dir, BASELINE_PATH), 'utf8')
    expect(parseBaseline(written)).toEqual([
      { file: 'backend/pkg/a.mts', symbol: 'kept', type: 'exports' },
    ])
    expect(written.endsWith('\n')).toBe(true)
    expect(existsSync(join(repo.dir, TEST_FILE))).toBe(true)
  })

  it('creates the baseline with --update when none exists', async () => {
    const repo = repoWith(REPORTS_KEPT)
    expect(await main(['--update'], captured(repo).options)).toBe(0)
    expect(existsSync(join(repo.dir, BASELINE_PATH))).toBe(true)
  })

  it('names the update command when the baseline is missing', async () => {
    const { options, text } = captured(repoWith(REPORTS_KEPT))
    expect(await main([], options)).toBe(1)
    expect(text()).toContain(UPDATE_COMMAND)
  })

  it('fails loudly, and restores the tree, when knip crashes', async () => {
    const repo = repoWith(CRASHES, baselineFor())
    const { options, text } = captured(repo)
    expect(await main([], options)).toBe(1)
    expect(text()).toContain('knip exited with status 2')
    expect(text()).toContain('ERROR: Invalid input')
    expect(runGit(repo.dir, 'status', '--porcelain')).toBe('')
  })

  it('refuses to run over local test changes', async () => {
    const repo = repoWith(REPORTS_KEPT, baselineFor('kept'))
    writeRepoFile(repo.dir, TEST_FILE, 'edited\n')
    const { options, text } = captured(repo)
    expect(await main([], options)).toBe(1)
    expect(text()).toContain('Refusing to run')
    expect(readFileSync(join(repo.dir, TEST_FILE), 'utf8')).toBe('edited\n')
  })

  it('rejects unknown arguments before touching the tree', async () => {
    const repo = repoWith(REPORTS_KEPT, baselineFor('kept'))
    const { options, text } = captured(repo)
    expect(await main(['--bogus'], options)).toBe(1)
    expect(text()).toContain('knip production-exports failed')
    expect(runGit(repo.dir, 'status', '--porcelain')).toBe('')
  })

  it('prints to the console when no output handlers are given', async () => {
    const log = vi.spyOn(console, 'log').mockReturnValue(undefined)
    const problem = vi.spyOn(console, 'error').mockReturnValue(undefined)
    expect(await main([], repoWith(REPORTS_KEPT, baselineFor('kept')))).toBe(0)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('known findings'))
    expect(await main(['--bogus'], repoWith(REPORTS_KEPT))).toBe(1)
    expect(problem).toHaveBeenCalledOnce()
  })
})

describe('createDeps', () => {
  afterEach(cleanup)

  it('reports a missing baseline file with the update command', async () => {
    const deps = createDeps({ ...repoWith(REPORTS_KEPT), abort: abort() })
    await expect(deps.readBaseline()).rejects.toThrow(UPDATE_COMMAND)
  })

  it('does not disguise other read failures as a missing baseline', async () => {
    const repo = repoWith(REPORTS_KEPT, baselineFor())
    rmSync(join(repo.dir, BASELINE_PATH))
    writeRepoFile(repo.dir, `${BASELINE_PATH}/inner`, 'x')
    const deps = createDeps({ ...repo, abort: abort() })
    await expect(deps.readBaseline()).rejects.toThrow(/EISDIR|ENOTDIR/)
  })

  it('formats the baseline without changing its data', async () => {
    const deps = createDeps({ ...repoWith(REPORTS_KEPT), abort: abort() })
    const findings = [{ file: 'backend/pkg/a.mts', symbol: 'kept', type: 'exports' as const }]
    expect(parseBaseline(await deps.formatBaseline(serializeBaseline(findings)))).toEqual(findings)
    await expect(deps.formatBaseline('{ not json')).rejects.toThrow('oxfmt could not format')
  })
})
