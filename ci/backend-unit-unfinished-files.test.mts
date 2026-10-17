import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatBackendUnitFileProgress } from '../test-helpers/vitest-file-progress-reporter.mts'
import { formatDeadlineReport, unfinishedFiles } from './backend-unit-unfinished-files.mts'

const start = (id: string) => formatBackendUnitFileProgress('start', id)
const finish = (id: string) => formatBackendUnitFileProgress('finish', id, 'passed')

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
