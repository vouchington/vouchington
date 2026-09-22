import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { COVERAGE_MANIFEST_FILENAME, runCoverageManifestCli } from './coverage-manifest.mts'

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'coverage-manifest-cli-'))
  mkdirSync(join(root, 'src'))
  mkdirSync(join(root, 'coverage'))
  writeFileSync(join(root, 'src/example.ts'), 'export const answer = 42\n')
  writeFileSync(
    join(root, 'coverage/lcov.info'),
    `TN:\nSF:${join(root, 'src/example.ts')}\nDA:1,1\nend_of_record\n`,
  )
  return {
    root,
    lcovPath: join(root, 'coverage/lcov.info'),
    manifestPath: join(root, 'coverage', COVERAGE_MANIFEST_FILENAME),
  }
}

function makeGitFixture() {
  const fixture = makeFixture()
  execFileSync('git', ['init', '-q'], { cwd: fixture.root })
  execFileSync('git', ['config', 'user.email', 'coverage@example.test'], { cwd: fixture.root })
  execFileSync('git', ['config', 'user.name', 'Coverage Test'], { cwd: fixture.root })
  execFileSync('git', ['add', '.'], { cwd: fixture.root })
  execFileSync('git', ['commit', '-qm', 'base'], { cwd: fixture.root })
  const base = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: fixture.root,
    encoding: 'utf8',
  }).trim()
  writeFileSync(join(fixture.root, 'src/example.ts'), 'export const answer = 43\n')
  execFileSync('git', ['add', '.'], { cwd: fixture.root })
  execFileSync('git', ['commit', '-qm', 'head'], { cwd: fixture.root })
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: fixture.root,
    encoding: 'utf8',
  }).trim()
  return { ...fixture, base, head }
}

describe('coverage provenance manifest CLI adapter', () => {
  it('stamps through the CLI contract with CI and local provenance', async () => {
    const fixture = makeFixture()
    const ciManifest = await runCoverageManifestCli(
      ['stamp', 'ts-shared', '4.1.10', fixture.lcovPath, fixture.manifestPath],
      {
        cwd: fixture.root,
        env: {
          GITHUB_REPOSITORY: 'vouchington/vouchington',
          GITHUB_RUN_ID: '456',
          GITHUB_RUN_ATTEMPT: '3',
        },
        revision: '1'.repeat(40),
      },
    )
    expect(ciManifest.run).toEqual({ id: '456', attempt: 3 })

    const local = makeFixture()
    expect(
      await runCoverageManifestCli(
        ['stamp', 'ts-shared', '4.1.10', local.lcovPath, local.manifestPath],
        { cwd: local.root, env: {}, revision: '2'.repeat(40) },
      ),
    ).toMatchObject({ repository: 'vouchington/vouchington', run: null })
  })

  it('creates a self-describing sparse patch contribution', async () => {
    const fixture = makeGitFixture()
    const manifest = await runCoverageManifestCli(
      ['patch', 'web-shard-3', '4.1.10', fixture.lcovPath, fixture.manifestPath],
      {
        cwd: fixture.root,
        env: {
          GITHUB_REPOSITORY: 'vouchington/vouchington',
          GITHUB_RUN_ID: '456',
          GITHUB_RUN_ATTEMPT: '3',
          PR_BASE_SHA: fixture.base,
          PR_HEAD_SHA: fixture.head,
          CI_SHARD: '3/3',
        },
        revision: '3'.repeat(40),
      },
    )
    expect(manifest).toMatchObject({
      version: 2,
      kind: 'patch-lcov',
      producer: { group: 'web', index: 3, total: 3 },
      patch: { base: fixture.base, head: fixture.head },
    })
  })

  it('requires the GitHub run identity fields together', async () => {
    const fixture = makeFixture()
    await expect(
      runCoverageManifestCli(
        ['stamp', 'ts-shared', '4.1.10', fixture.lcovPath, fixture.manifestPath],
        {
          cwd: fixture.root,
          env: { GITHUB_RUN_ID: '456' },
          revision: '3'.repeat(40),
        },
      ),
    ).rejects.toThrowError(/must be provided together/)
  })

  it('names a missing coverage producer instead of throwing raw ENOENT', async () => {
    const fixture = makeFixture()
    const missingLcov = join(fixture.root, 'coverage', 'missing-lcov.info')
    await expect(
      runCoverageManifestCli(['stamp', 'tooling', '4.1.10', missingLcov, fixture.manifestPath], {
        cwd: fixture.root,
        env: {},
        revision: '5'.repeat(40),
      }),
    ).rejects.toThrowError(`Missing coverage producer LCOV for suite 'tooling' at ${missingLcov}`)
  })

  it('rejects unknown Vouchington suite names', async () => {
    const fixture = makeFixture()
    await expect(
      runCoverageManifestCli(
        ['stamp', 'unknown-suite', '1.0.0', fixture.lcovPath, fixture.manifestPath],
        {
          cwd: fixture.root,
          env: {},
          revision: '4'.repeat(40),
        },
      ),
    ).rejects.toThrowError(/Unknown coverage suite/)
  })
})
