import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  workspaceRootCoverageErrors,
  checkWorkspaceRootCoverage,
} from '../static-code-analysis/repo-file-policy/workspace-root-coverage.mts'

describe('workspace root coverage', () => {
  it('accepts tracked roots and declared workspace prefixes', () => {
    expect(
      workspaceRootCoverageErrors(
        ['backend/package.json', 'ci/check.mts'],
        ['backend', 'ci', 'web'],
        ['web/*'],
      ),
    ).toEqual([])
  })
  it('rejects an omitted tracked root', () => {
    expect(
      workspaceRootCoverageErrors(['backend/package.json', 'new/owner.mts'], ['backend'], []),
    ).toEqual(['Workspace packageRoots omits tracked directory: new'])
  })
  it('rejects a stale root without a declared workspace prefix', () => {
    expect(
      workspaceRootCoverageErrors(['backend/package.json'], ['backend', 'removed'], []),
    ).toEqual(['Workspace packageRoots has stale directory: removed'])
  })
  it('normalizes directory separators without treating root files as directories', () => {
    expect(
      workspaceRootCoverageErrors(['package.json', 'backend/a.mts'], ['./backend'], []),
    ).toEqual([])
  })
})

describe('finite configuration', () => {
  it('checks real fixture configuration and fails closed on a missing required coverage option', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workspace-static-policy-'))
    try {
      await mkdir(join(root, 'backend'))
      await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages: [backend]\n')
      await writeFile(
        join(root, '.no-mistakes.yml'),
        'rules:\n  - rule: package-json-workspace-coverage\n    options:\n      requireNamedPackage: true\n      packageRoots: [backend]\n',
      )
      expect(
        checkWorkspaceRootCoverage(root, [
          '.no-mistakes.yml',
          'pnpm-workspace.yaml',
          'backend/package.json',
        ]),
      ).toEqual([])
      expect(() =>
        checkWorkspaceRootCoverage(root, ['.no-mistakes.yml', 'backend/package.json']),
      ).toThrow('Workspace package configuration must be tracked')
      await writeFile(join(root, '.no-mistakes.yml'), 'rules: []\n')
      expect(checkWorkspaceRootCoverage(root, ['.no-mistakes.yml'])).toEqual([
        'Workspace coverage requires packageRoots and requireNamedPackage',
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
