import { describe, expect, it } from 'vitest'

import {
  collectLicenseReport,
  type LicenseListExecutor,
  validateSupportedArchitectureCoverage,
} from './collect-licenses.mts'

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

const supportedArchitectureFiles = {
  '/repo/pnpm-lock.yaml': 'packages: {}\n',
  '/repo/pnpm-workspace.yaml':
    'supportedArchitectures:\n  os: [current]\n  cpu: [current]\n  libc: [current]\n',
}

function collectTestReport(execute: LicenseListExecutor) {
  return collectLicenseReport('/repo', execute, (path: string) => {
    const source = supportedArchitectureFiles[path as keyof typeof supportedArchitectureFiles]
    if (source === undefined) throw new Error(`missing fixture ${path}`)
    return source
  })
}

describe('collectLicenseReport', () => {
  it('accepts a supported-architectures configuration that covers every lockfile platform', () => {
    expect(() =>
      validateSupportedArchitectureCoverage(
        `packages:\n  example@1.0.0:\n    os: [win32]\n    cpu: [arm64]\n    libc: [musl]\n`,
        `supportedArchitectures:\n  os: [current, win32]\n  cpu: [current, arm64]\n  libc: [current, musl]\n`,
        { lockfile: 'pnpm-lock.yaml', workspace: 'pnpm-workspace.yaml' },
      ),
    ).not.toThrow()
  })

  it.each([
    [
      'os',
      `supportedArchitectures:\n  os: [current]\n  cpu: [current, arm64]\n  libc: [current, musl]\n`,
    ],
    [
      'cpu',
      `supportedArchitectures:\n  os: [current, win32]\n  cpu: [current]\n  libc: [current, musl]\n`,
    ],
    [
      'libc',
      `supportedArchitectures:\n  os: [current, win32]\n  cpu: [current, arm64]\n  libc: [current]\n`,
    ],
  ])(
    'rejects a supported-architectures configuration that omits a lockfile %s value',
    (key, workspace) => {
      expect(() =>
        validateSupportedArchitectureCoverage(
          `packages:\n  example@1.0.0:\n    os: [win32]\n    cpu: [arm64]\n    libc: [musl]\n`,
          workspace,
          { lockfile: 'pnpm-lock.yaml', workspace: 'pnpm-workspace.yaml' },
        ),
      ).toThrow(`supportedArchitectures.${key} is missing lockfile values`)
    },
  )

  it('parses a well-formed JSON report', () => {
    const report = collectTestReport(
      fakeExecutor({
        status: 0,
        stdout: JSON.stringify({ MIT: [{ name: 'left-pad', versions: ['1.0.0'] }] }),
      }),
    )
    expect(report).toEqual({ MIT: [{ name: 'left-pad', versions: ['1.0.0'] }] })
  })

  it('handles an empty report object', () => {
    const report = collectTestReport(fakeExecutor({ status: 0, stdout: '{}' }))
    expect(report).toEqual({})
  })

  it('throws when the spawned process errors', () => {
    const spawnError = new Error('ENOENT: pnpm not found')
    expect(() => collectTestReport(fakeExecutor({ error: spawnError, status: null }))).toThrow(
      spawnError,
    )
  })

  it('throws with stderr context on a non-zero exit', () => {
    expect(() =>
      collectTestReport(
        fakeExecutor({ status: 1, stderr: 'ERR_PNPM_NO_LOCKFILE something went wrong' }),
      ),
    ).toThrow(/status 1.*ERR_PNPM_NO_LOCKFILE/s)
  })

  it('throws a descriptive error on malformed JSON instead of returning garbage', () => {
    expect(() => collectTestReport(fakeExecutor({ status: 0, stdout: 'not json' }))).toThrow(
      /unparseable output/,
    )
  })

  it('throws when the JSON output is an array instead of an object', () => {
    expect(() => collectTestReport(fakeExecutor({ status: 0, stdout: '[]' }))).toThrow(
      /expected a JSON object/,
    )
  })

  it('throws when the JSON output is a bare scalar', () => {
    expect(() => collectTestReport(fakeExecutor({ status: 0, stdout: 'null' }))).toThrow(
      /expected a JSON object/,
    )
  })

  it.each([
    ['a non-array license group', { MIT: {} }, /license group "MIT" to be an array/],
    ['a non-object entry', { MIT: ['left-pad'] }, /license group "MIT" entry 0 to be an object/],
    ['a missing package name', { MIT: [{}] }, /entry 0\.name to be a string/],
    [
      'a non-array versions value',
      { MIT: [{ name: 'left-pad', versions: '1.0.0' }] },
      /entry 0\.versions to be an array of strings/,
    ],
    [
      'a non-string version',
      { MIT: [{ name: 'left-pad', versions: [1] }] },
      /entry 0\.versions to be an array of strings/,
    ],
  ])('rejects nested report output containing %s', (_description, report, message) => {
    expect(() =>
      collectTestReport(fakeExecutor({ status: 0, stdout: JSON.stringify(report) })),
    ).toThrow(message)
  })

  it('preserves an omitted versions list', () => {
    expect(
      collectTestReport(
        fakeExecutor({ status: 0, stdout: JSON.stringify({ MIT: [{ name: 'left-pad' }] }) }),
      ),
    ).toEqual({ MIT: [{ name: 'left-pad' }] })
  })
})
