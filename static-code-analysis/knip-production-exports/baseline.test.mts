import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import baseline from './baseline.mts'

const issue = { severity: 'error' }
const findings = () => ({
  report: { exports: true, types: true, files: false },
  issues: {
    exports: {
      'a/one.mts': { kept: issue, kept2: issue, listed: issue },
      'a/two.mts': { listed: issue },
    },
    types: { 'b/three.mts': { Listed: issue } },
    files: { 'c/unreported.mts': { 'c/unreported.mts': issue } },
  },
  counters: { exports: 4, types: 1, files: 1 },
})
const listed = ['exports a/one.mts listed', 'exports a/two.mts listed', 'types b/three.mts Listed']

describe('knip production-exports baseline preprocessor', () => {
  const errors = vi.spyOn(console, 'error').mockReturnValue(undefined)
  let dir = ''
  let file = ''
  const write = (lines: string[]) => writeFileSync(file, `${lines.join('\n')}\n`)
  // Runs the preprocessor and detaches the `exit` listener it may have registered.
  const run = () => {
    const before = process.listeners('exit')
    const result = baseline(findings(), file)
    const [onExit] = process.listeners('exit').filter(listener => !before.includes(listener))
    if (onExit) process.off('exit', onExit)
    return { result, onExit }
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'knip-baseline-'))
    file = join(dir, 'baseline.txt')
    errors.mockClear()
  })
  afterEach(() => {
    rmSync(dir, { recursive: true })
    vi.unstubAllEnvs()
  })

  it('drops baselined findings, decrements their counters, and keeps new ones', () => {
    write(listed)
    const { result, onExit } = run()

    expect(result.issues).toEqual({
      exports: { 'a/one.mts': { kept: issue, kept2: issue } },
      types: {},
      files: findings().issues.files,
    })
    expect(result.counters).toEqual({ exports: 2, types: 0, files: 1 })
    expect(errors).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('New exports'))
    expect(onExit).toBeUndefined()
  })

  it('reports stale baseline entries and fails the process on exit', () => {
    const stale = 'exports a/gone.mts removedExport'
    write([...listed, 'exports a/one.mts kept', 'exports a/one.mts kept2', stale])
    const { onExit } = run()

    expect(errors).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(stale))
    try {
      onExit?.(0)
      expect(process.exitCode).toBe(1)
    } finally {
      process.exitCode = undefined
    }
  })

  it('rewrites the baseline from all reported findings when updating', () => {
    write(['exports a/gone.mts removedExport'])
    vi.stubEnv('KNIP_BASELINE_UPDATE', '1')
    const { result, onExit } = run()

    expect(readFileSync(file, 'utf8')).toBe(
      `${['exports a/one.mts kept', 'exports a/one.mts kept2', ...listed].join('\n')}\n`,
    )
    expect(result.issues).toEqual({ exports: {}, types: {}, files: findings().issues.files })
    expect(result.counters).toEqual({ exports: 0, types: 0, files: 1 })
    expect(errors).not.toHaveBeenCalled()
    expect(onExit).toBeUndefined()
  })
})
