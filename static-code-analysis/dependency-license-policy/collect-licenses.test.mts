import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

import {
  collectLicenseReport,
  type PnpmExecutor,
  renderLicenseAuditWorkspace,
} from './collect-licenses.mts'

type PnpmResult = {
  error?: Error
  status: number | null
  stderr?: string
  stdout?: string
}

function fakeExecutor(result: PnpmResult, fetchResult: PnpmResult = { status: 0 }): PnpmExecutor {
  const steps = [
    {
      args: [
        '--config.store-dir=/audit/.pnpm-store',
        '--config.force=true',
        'fetch',
        '--ignore-scripts',
      ],
      result: fetchResult,
    },
    {
      args: ['--config.store-dir=/audit/.pnpm-store', 'licenses', 'list', '--json'],
      result,
    },
  ]
  return (command, args, options) => {
    const step = steps.shift()
    if (!step) throw new Error(`unexpected pnpm invocation: ${args.join(' ')}`)
    expect(command).toBe('pnpm')
    expect(args).toEqual(step.args)
    expect(options.cwd).toBe('/audit')
    expect(options.encoding).toBe('utf8')
    return { stderr: '', stdout: '', ...step.result }
  }
}

function collectTestReport(execute: PnpmExecutor, cleanup: () => void = () => undefined) {
  return collectLicenseReport(
    '/repo',
    execute,
    (path: string) => {
      if (path === '/repo/pnpm-lock.yaml') return 'packages: {}\n'
      expect(path).toBe('/repo/pnpm-workspace.yaml')
      return 'packages: [app]\nengineStrict: true\n'
    },
    (repoRoot, lockfileSource, workspaceSource) => {
      expect(repoRoot).toBe('/repo')
      expect(lockfileSource).toBe('packages: {}\n')
      expect(workspaceSource).toBe('packages: [app]\nengineStrict: true\n')
      return { cwd: '/audit', cleanup }
    },
  )
}

describe('collectLicenseReport', () => {
  it('derives a command-scoped supported-architectures workspace from the lockfile', () => {
    const workspace = parseYaml(
      renderLicenseAuditWorkspace(
        `packages:\n  example@1.0.0:\n    os: [win32]\n    cpu: [arm64]\n    libc: [musl]\n`,
        'packages: [app]\nengineStrict: true\n',
        { lockfile: 'pnpm-lock.yaml', workspace: 'pnpm-workspace.yaml' },
      ),
    ) as {
      packages: string[]
      supportedArchitectures: Record<string, string[]>
    }

    expect(workspace).toEqual({
      engineStrict: true,
      packages: [],
      supportedArchitectures: {
        cpu: ['current', 'arm64'],
        libc: ['current', 'musl'],
        os: ['current', 'win32'],
      },
    })
  })

  it('rejects a malformed lockfile platform selector', () => {
    expect(() =>
      renderLicenseAuditWorkspace(`packages:\n  example@1.0.0:\n    os: 42\n`, 'packages: []\n', {
        lockfile: 'pnpm-lock.yaml',
        workspace: 'pnpm-workspace.yaml',
      }),
    ).toThrow('pnpm-lock.yaml packages.*.os to be a string or an array of strings')
  })

  it('normalizes scalar lockfile platform selectors', () => {
    const workspace = parseYaml(
      renderLicenseAuditWorkspace(
        `packages:\n  example@1.0.0:\n    os: linux\n    cpu: arm64\n    libc: musl\n`,
        'packages: []\n',
        { lockfile: 'pnpm-lock.yaml', workspace: 'pnpm-workspace.yaml' },
      ),
    ) as { supportedArchitectures: Record<string, string[]> }

    expect(workspace.supportedArchitectures).toEqual({
      cpu: ['current', 'arm64'],
      libc: ['current', 'musl'],
      os: ['current', 'linux'],
    })
  })

  it('cleans the command-scoped workspace after success and failure', () => {
    let cleanupCount = 0
    const cleanup = () => {
      cleanupCount += 1
    }

    collectTestReport(fakeExecutor({ status: 0, stdout: '{}' }), cleanup)
    expect(() =>
      collectTestReport(fakeExecutor({ error: new Error('spawn failed'), status: null }), cleanup),
    ).toThrow('spawn failed')
    expect(() =>
      collectTestReport(
        fakeExecutor(
          { status: 0, stdout: '{}' },
          { error: new Error('fetch spawn failed'), status: null },
        ),
        cleanup,
      ),
    ).toThrow('fetch spawn failed')
    expect(cleanupCount).toBe(3)
  })

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

  it('preserves a prototype-shaped license group as auditable report data', () => {
    const report = collectTestReport(
      fakeExecutor({ status: 0, stdout: '{"__proto__":[{"name":"unsafe-package"}]}' }),
    )
    expect(Object.entries(report)).toEqual([['__proto__', [{ name: 'unsafe-package' }]]])
  })

  it('throws when the spawned process errors', () => {
    const spawnError = new Error('ENOENT: pnpm not found')
    expect(() => collectTestReport(fakeExecutor({ error: spawnError, status: null }))).toThrow(
      spawnError,
    )
  })

  it('throws with stderr context when the command-scoped fetch fails', () => {
    expect(() =>
      collectTestReport(
        fakeExecutor(
          { status: 0, stdout: '{}' },
          { status: 1, stderr: 'ERR_PNPM_FETCH_403 forbidden' },
        ),
      ),
    ).toThrow(/pnpm fetch.*status 1.*ERR_PNPM_FETCH_403/s)
  })

  it('throws with stderr context on a non-zero exit', () => {
    expect(() =>
      collectTestReport(
        fakeExecutor({ status: 1, stderr: 'ERR_PNPM_NO_LOCKFILE something went wrong' }),
      ),
    ).toThrow(/status 1.*ERR_PNPM_NO_LOCKFILE/s)
  })

  it('preserves JSON error output written to stdout on a non-zero exit', () => {
    expect(() =>
      collectTestReport(
        fakeExecutor({
          status: 1,
          stdout: '{"error":{"code":"ERR_PNPM_MISSING_PACKAGE_INDEX_FILE"}}',
        }),
      ),
    ).toThrow(/status 1.*ERR_PNPM_MISSING_PACKAGE_INDEX_FILE/s)
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
