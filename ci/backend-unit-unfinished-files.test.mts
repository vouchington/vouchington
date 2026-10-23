import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatFileProgress } from 'vouchington-tooling/vitest-diagnostics'
import { formatDeadlineReport, unfinishedFiles } from './backend-unit-unfinished-files.mts'

const start = (id: string, at?: number) =>
  formatFileProgress('start', id, undefined, at, '[backend-unit-file]')
const finish = (id: string, at?: number) =>
  formatFileProgress('finish', id, 'passed', at, '[backend-unit-file]')

describe('backend-unit deadline report', () => {
  it('lists files that started and never finished, including odd characters', () => {
    const progress = [
      start('a.test.mts'),
      start('b "quoted".test.mts'),
      start('c.test.mts'),
      finish('a.test.mts'),
      'unrelated log line\n',
      finish('c.test.mts'),
    ].join('')

    expect(unfinishedFiles(progress)).toEqual(['b "quoted".test.mts'])
    expect(formatDeadlineReport(progress)).toBe(
      '[backend-unit-deadline] 1 test file(s) started and not finished\n' +
        '[backend-unit-deadline] unfinished b "quoted".test.mts\n',
    )
  })

  it('reports how long unfinished files ran and which finished files were slowest', () => {
    const progress = [
      start('slow.test.mts', 1_000),
      start('fast.test.mts', 2_000),
      finish('fast.test.mts', 3_000),
      finish('slow.test.mts', 241_000),
      start('inflight.test.mts', 250_000),
    ].join('')

    expect(formatDeadlineReport(progress, 'deadline', 262_000)).toBe(
      '[deadline] 1 test file(s) started and not finished\n' +
        '[deadline] unfinished inflight.test.mts (running 12s)\n' +
        '[deadline] slowest finished 240s slow.test.mts\n' +
        '[deadline] slowest finished 1s fast.test.mts\n',
    )
  })

  it('prints through the command line, and says so when no progress file exists', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'unfinished-'))
    const file = path.join(dir, 'progress.log')
    writeFileSync(file, start('hung.test.mts'))
    const run = (target: string) =>
      spawnSync('node', ['ci/backend-unit-unfinished-files.mts', target], { encoding: 'utf8' })

    expect(run(file).stdout).toContain('unfinished hung.test.mts')
    expect(run(path.join(dir, 'missing.log')).stdout).toBe(
      '[backend-unit-deadline] no file progress was recorded\n',
    )
  })
})
