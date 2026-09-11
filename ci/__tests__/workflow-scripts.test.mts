import { execFile } from 'node:child_process'

import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'
import { stampLocalCoverageSuite } from '../coverage-local-provenance.mts'

const execFileAsync = promisify(execFile)

describe('workflow shell scripts', () => {
  it('check-needs-results fails when a needed job failed', async () => {
    await expect(
      execFileAsync('./ci/check-needs-results.sh', ['required jobs'], {
        env: {
          ...process.env,
          RESULTS: '{"static-code-analysis":{"result":"failure"}}',
        },
      }),
    ).rejects.toMatchObject({ code: 1 })
  })

  it('local-patch-coverage delegates to coverage-check after finding LCOV', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-local-coverage-'))
    const coverageDir = join(dir, 'coverage')
    const pairDir = join(coverageDir, 'tooling')
    const jsonPath = join(dir, 'coverage.json')
    await mkdir(pairDir, { recursive: true })
    await writeFile(
      join(pairDir, 'lcov.info'),
      [
        'TN:',
        `SF:${join(process.cwd(), 'ci/coverage-local-utils.mts')}`,
        'DA:1,1',
        'LF:1',
        'LH:1',
        'end_of_record',
        '',
      ].join('\n'),
    )
    stampLocalCoverageSuite('tooling', coverageDir)

    await execFileAsync('node', [
      'ci/local-patch-coverage.mts',
      '--artifacts',
      coverageDir,
      '--base',
      'HEAD',
      '--head',
      'HEAD',
      '--json',
      jsonPath,
    ])

    const json = await readFile(jsonPath, 'utf8')
    const parsed = JSON.parse(json)
    expect(parsed).toHaveProperty('passed', true)
  })

  it('local-patch-coverage fails before coverage-check when LCOV is absent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-local-coverage-missing-'))

    await expect(
      execFileAsync('node', ['ci/local-patch-coverage.mts', '--artifacts', dir]),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('No signed coverage artifacts found'),
    })
  })
})
