import { describe, expect, it } from 'vitest'

import { collectLicenseReport, type LicenseListExecutor } from './collect-licenses.mts'

function fakeExecutor(result: {
  error?: Error
  status: number | null
  stderr?: string
  stdout?: string
}): LicenseListExecutor {
  return (command, args, options) => {
    expect(command).toBe('pnpm')
    expect(args).toEqual(['licenses', 'list', '--json'])
    expect(options.cwd).toBe('/repo')
    expect(options.encoding).toBe('utf8')
    return { stderr: '', stdout: '', ...result }
  }
}

describe('collectLicenseReport', () => {
  it('parses a well-formed JSON report', () => {
    const report = collectLicenseReport(
      '/repo',
      fakeExecutor({
        status: 0,
        stdout: JSON.stringify({ MIT: [{ name: 'left-pad', versions: ['1.0.0'] }] }),
      }),
    )
    expect(report).toEqual({ MIT: [{ name: 'left-pad', versions: ['1.0.0'] }] })
  })

  it('handles an empty report object', () => {
    const report = collectLicenseReport('/repo', fakeExecutor({ status: 0, stdout: '{}' }))
    expect(report).toEqual({})
  })

  it('throws when the spawned process errors', () => {
    const spawnError = new Error('ENOENT: pnpm not found')
    expect(() =>
      collectLicenseReport('/repo', fakeExecutor({ error: spawnError, status: null })),
    ).toThrow(spawnError)
  })

  it('throws with stderr context on a non-zero exit', () => {
    expect(() =>
      collectLicenseReport(
        '/repo',
        fakeExecutor({ status: 1, stderr: 'ERR_PNPM_NO_LOCKFILE something went wrong' }),
      ),
    ).toThrow(/status 1.*ERR_PNPM_NO_LOCKFILE/s)
  })

  it('throws a descriptive error on malformed JSON instead of returning garbage', () => {
    expect(() =>
      collectLicenseReport('/repo', fakeExecutor({ status: 0, stdout: 'not json' })),
    ).toThrow(/unparseable output/)
  })

  it('throws when the JSON output is an array instead of an object', () => {
    expect(() => collectLicenseReport('/repo', fakeExecutor({ status: 0, stdout: '[]' }))).toThrow(
      /expected a JSON object/,
    )
  })

  it('throws when the JSON output is a bare scalar', () => {
    expect(() =>
      collectLicenseReport('/repo', fakeExecutor({ status: 0, stdout: 'null' })),
    ).toThrow(/expected a JSON object/)
  })
})
