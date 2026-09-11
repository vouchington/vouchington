import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createPatchCoverageContribution } from 'coverage-check'
import { describe, expect, it } from 'vitest'

import { coverageSuiteDescriptor } from './coverage-suites.mts'
import {
  expectedCoverageProducerGroups,
  prepareCoverageArtifacts,
  type PrepareCoverageArtifactsOptions,
} from './prepare-coverage-artifacts.mts'

const repository = 'jonathanong/filaments'
const revision = 'a'.repeat(40)
const run = { id: '1234', currentAttempt: 2 } as const

function fixture(): PrepareCoverageArtifactsOptions {
  const root = mkdtempSync(join(tmpdir(), 'patch-coverage-fan-in-'))
  mkdirSync(join(root, 'src'))
  mkdirSync(join(root, 'node_modules/vitest'), { recursive: true })
  mkdirSync(join(root, 'coverage'))
  writeFileSync(join(root, 'src/example.ts'), 'export const answer = 42\n')
  writeFileSync(join(root, 'node_modules/vitest/package.json'), '{"version":"4.1.11"}\n')
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'coverage@example.test'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Coverage Test'], { cwd: root })
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['commit', '-qm', 'base'], { cwd: root })
  const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  writeFileSync(join(root, 'src/example.ts'), 'export const answer = 43\n')
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['commit', '-qm', 'head'], { cwd: root })
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  return {
    root,
    sourceDir: join(root, 'coverage'),
    artifactsDir: join(root, 'artifacts'),
    repository,
    revision,
    expectedRun: run,
    base,
    head,
  }
}

async function writePair(
  options: PrepareCoverageArtifactsOptions,
  suite: string,
  producer: { group: string; index: number; total: number },
  hits = 1,
  attempt = 1,
): Promise<string> {
  const pairDir = join(options.sourceDir, `coverage-${suite}`)
  mkdirSync(pairDir, { recursive: true })
  const lcovPath = join(pairDir, 'lcov.info')
  const manifestPath = join(pairDir, 'coverage-manifest.json')
  writeFileSync(lcovPath, `TN:\nSF:src/example.ts\nDA:1,${hits}\nend_of_record\n`)
  await createPatchCoverageContribution({
    root: options.root,
    lcovPath,
    manifestPath,
    descriptor: coverageSuiteDescriptor(suite),
    repository,
    revision,
    run: { id: run.id, attempt },
    collectorVersion: '4.1.11',
    base: options.base,
    head: options.head,
    producer,
  })
  return pairDir
}

describe('Filaments patch coverage artifact fan-in', () => {
  it('keeps API and full-stack integration coverage producer partitions distinct', async () => {
    const options = fixture()
    await writePair(options, 'web-api-shard-1', {
      group: 'web-api',
      index: 1,
      total: 1,
    })
    await writePair(options, 'web-integration-shard-1', {
      group: 'web-integration',
      index: 1,
      total: 1,
    })

    await expect(
      prepareCoverageArtifacts({
        ...options,
        expectedProducerGroups: ['web-api', 'web-integration'],
      }),
    ).resolves.toEqual({
      selected: [{ suite: 'web-api-shard-1' }, { suite: 'web-integration-shard-1' }],
    })
  })

  it('discovers a dynamic shard set without a precomputed catalog', async () => {
    const options = fixture()
    for (let index = 1; index <= 3; index += 1) {
      await writePair(options, `web-shard-${index}`, {
        group: 'web',
        index,
        total: 3,
      })
    }

    await expect(prepareCoverageArtifacts(options)).resolves.toEqual({
      selected: [{ suite: 'web-shard-1' }, { suite: 'web-shard-2' }, { suite: 'web-shard-3' }],
    })
    expect(
      readFileSync(join(options.artifactsDir, 'coverage-web-shard-2/lcov.info'), 'utf8'),
    ).toContain('DA:1,1')
  })

  it('rejects unknown suites before canonical output', async () => {
    const options = fixture()
    mkdirSync(join(options.sourceDir, 'coverage-unknown-suite'))
    await expect(prepareCoverageArtifacts(options)).rejects.toThrowError(/Unexpected.*suite/i)
  })

  it('atomically replaces stale canonical output on the no-producer path', async () => {
    const options = fixture()
    mkdirSync(join(options.artifactsDir, 'coverage-stale'), { recursive: true })
    writeFileSync(join(options.artifactsDir, 'coverage-stale/lcov.info'), 'stale')

    await expect(prepareCoverageArtifacts(options)).resolves.toEqual({ selected: [] })
    expect(readdirSync(options.artifactsDir)).toEqual([])
  })

  it('prunes an incomplete stale producer group that the current selection no longer expects', async () => {
    const options = fixture()
    await writePair(options, 'tooling', { group: 'tooling', index: 1, total: 1 }, 1, 2)
    await writePair(options, 'web-shard-1', { group: 'web', index: 1, total: 2 })

    await expect(
      prepareCoverageArtifacts({ ...options, expectedProducerGroups: ['tooling'] }),
    ).resolves.toEqual({ selected: [{ suite: 'tooling' }] })
  })

  it('reuses a complete earlier attempt for a producer group the current selection requires', async () => {
    const options = fixture()
    await writePair(options, 'tooling', { group: 'tooling', index: 1, total: 1 })

    await expect(
      prepareCoverageArtifacts({ ...options, expectedProducerGroups: ['tooling'] }),
    ).resolves.toEqual({ selected: [{ suite: 'tooling' }] })
  })

  it('rejects an incomplete earlier attempt for a producer group the current selection requires', async () => {
    const options = fixture()
    await writePair(options, 'web-shard-1', { group: 'web', index: 1, total: 2 })

    await expect(
      prepareCoverageArtifacts({ ...options, expectedProducerGroups: ['web'] }),
    ).rejects.toThrowError(/partition/i)
  })

  it('rejects an unselected producer group that has a current-attempt contribution', async () => {
    const options = fixture()
    await writePair(options, 'tooling', { group: 'tooling', index: 1, total: 1 }, 1, 2)
    await writePair(options, 'web-shard-1', { group: 'web', index: 1, total: 1 }, 1, 2)

    await expect(
      prepareCoverageArtifacts({ ...options, expectedProducerGroups: ['tooling'] }),
    ).rejects.toThrowError('Unexpected current-attempt patch coverage producer group: web')
  })

  it('rejects a mixed-attempt unselected group when one contribution is current', async () => {
    const options = fixture()
    await writePair(options, 'tooling', { group: 'tooling', index: 1, total: 1 }, 1, 2)
    await writePair(options, 'web-shard-1', { group: 'web', index: 1, total: 2 })
    await writePair(options, 'web-shard-2', { group: 'web', index: 2, total: 2 }, 1, 2)

    await expect(
      prepareCoverageArtifacts({ ...options, expectedProducerGroups: ['tooling'] }),
    ).rejects.toThrowError('Unexpected current-attempt patch coverage producer group: web')
  })

  it('rejects current-attempt output when the expected producer selection is empty', async () => {
    const options = fixture()
    await writePair(options, 'tooling', { group: 'tooling', index: 1, total: 1 }, 1, 2)

    await expect(
      prepareCoverageArtifacts({ ...options, expectedProducerGroups: [] }),
    ).rejects.toThrowError('Unexpected current-attempt patch coverage producer group: tooling')
  })

  it('rejects an expected producer group when no matching contribution exists', async () => {
    const options = fixture()

    await expect(
      prepareCoverageArtifacts({ ...options, expectedProducerGroups: ['tooling'] }),
    ).rejects.toThrowError('Missing expected patch coverage producer group: tooling')
  })

  it('keeps incomplete earlier groups strict when no expected selection is provided', async () => {
    const options = fixture()
    await writePair(options, 'web-shard-1', { group: 'web', index: 1, total: 2 })

    await expect(prepareCoverageArtifacts(options)).rejects.toThrowError(/partition/i)
  })

  it('derives every required producer group from successful jobs', () => {
    expect(
      expectedCoverageProducerGroups(
        JSON.stringify({
          'detect-changes': { result: 'success' },
          'test-tooling': { result: 'success' },
          'test-web': { result: 'success' },
          storybook: { result: 'success' },
        }),
        'empty',
      ),
    ).toEqual(['tooling', 'web', 'web-storybook'])
    expect(
      expectedCoverageProducerGroups(
        JSON.stringify({
          'detect-changes': { result: 'success' },
          'test-tooling': { result: 'skipped' },
          storybook: { result: 'success' },
        }),
        'full',
      ),
    ).toEqual(['web-storybook', 'web-storybook-browser'])
  })

  it('rejects a successful producer without a group contract', () => {
    expect(() =>
      expectedCoverageProducerGroups(
        JSON.stringify({ 'test-new-producer': { result: 'success' } }),
        'full',
      ),
    ).toThrowError('Successful coverage producer has no group contract: test-new-producer')
  })
})
