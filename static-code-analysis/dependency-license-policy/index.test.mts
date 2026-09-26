import { describe, expect, it } from 'vitest'
import {
  collectPnpmLicenseReport,
  type PnpmLicenseReport,
} from 'vouchington-tooling/dependency-license-policy'

import { checkDependencyLicensePolicy } from './index.mts'

const insideGitRepoCtx = {
  isInsideGitRepo: true,
  readTrackedFile: () => null,
  repoRoot: '/repo',
  trackedFileSet: new Set<string>(),
  trackedFiles: [],
}

describe('checkDependencyLicensePolicy', () => {
  it('loads the async license collector published with interrupted-run cleanup', () => {
    expect(collectPnpmLicenseReport.constructor.name).toBe('AsyncFunction')
  })

  it('returns no errors when the repo root is not a git repository', async () => {
    const result = await checkDependencyLicensePolicy({
      ...insideGitRepoCtx,
      isInsideGitRepo: false,
    })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('is not inside a git repository')
  })

  it('passes on a clean report with only permissive and allowlisted licenses', async () => {
    const report: PnpmLicenseReport = {
      MIT: [{ name: 'left-pad', versions: ['1.0.0'] }],
      'MPL-2.0': [{ name: '@ghostery/adblocker', versions: ['2.18.2'] }],
      'LGPL-3.0-or-later': [{ name: '@img/sharp-libvips-darwin-arm64', versions: ['1.3.3'] }],
    }
    const result = await checkDependencyLicensePolicy(insideGitRepoCtx, {
      collectPnpmLicenseReport: () => report,
    })
    expect(result.errors).toEqual([])
  })

  it('reports one error per denied package, naming the package, version, and license', async () => {
    const report: PnpmLicenseReport = {
      'GPL-3.0-only': [{ name: 'copyleft-lib', versions: ['2.0.0'] }],
      MIT: [{ name: 'left-pad', versions: ['1.0.0'] }],
    }
    const result = await checkDependencyLicensePolicy(insideGitRepoCtx, {
      collectPnpmLicenseReport: () => report,
    })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('copyleft-lib@2.0.0')
    expect(result.errors[0]).toContain('GPL-3.0-only')
    expect(result.errors[0]).toContain('::error::')
  })

  it('does not flag LGPL-3.0-or-later outside the audited sharp package allowlist scope', async () => {
    const report: PnpmLicenseReport = {
      'LGPL-3.0-or-later': [{ name: 'some-other-lgpl-lib', versions: ['1.0.0'] }],
    }
    const result = await checkDependencyLicensePolicy(insideGitRepoCtx, {
      collectPnpmLicenseReport: () => report,
    })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('some-other-lgpl-lib')
  })

  it('reports a package with no versions field using a safe placeholder, not a crash', async () => {
    const report: PnpmLicenseReport = { 'AGPL-3.0-only': [{ name: 'no-version-lib' }] }
    const result = await checkDependencyLicensePolicy(insideGitRepoCtx, {
      collectPnpmLicenseReport: () => report,
    })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('no-version-lib@unknown version')
  })

  it('surfaces a collection failure as a check error instead of throwing', async () => {
    const result = await checkDependencyLicensePolicy(insideGitRepoCtx, {
      collectPnpmLicenseReport: () => {
        throw new Error('pnpm not found')
      },
    })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('failed to collect the pnpm license report')
    expect(result.errors[0]).toContain('pnpm not found')
  })

  it('surfaces a rejected collection promise as a check error instead of throwing', async () => {
    const result = await checkDependencyLicensePolicy(insideGitRepoCtx, {
      collectPnpmLicenseReport: () => Promise.reject(new Error('pnpm fetch aborted')),
    })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('failed to collect the pnpm license report')
    expect(result.errors[0]).toContain('pnpm fetch aborted')
  })

  it('passes on an empty report', async () => {
    const result = await checkDependencyLicensePolicy(insideGitRepoCtx, {
      collectPnpmLicenseReport: () => ({}),
    })
    expect(result.errors).toEqual([])
  })
})
