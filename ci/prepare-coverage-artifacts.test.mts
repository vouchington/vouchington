import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
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

const repository = 'vouchington/vouchington'
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
): Promise<string> {
  const pairDir = join(options.sourceDir, `coverage-${suite}`)
  mkdirSync(pairDir, { recursive: true })
  const lcovPath = join(pairDir, 'lcov.info')
  const manifestPath = join(pairDir, 'coverage-manifest.json')
  writeFileSync(lcovPath, `TN:\nSF:src/example.ts\nDA:1,1\nend_of_record\n`)
  await createPatchCoverageContribution({
    root: options.root,
    lcovPath,
    manifestPath,
    descriptor: coverageSuiteDescriptor(suite),
    repository,
    revision,
    run: { id: run.id, attempt: 1 },
    collectorVersion: '4.1.11',
    base: options.base,
    head: options.head,
    producer,
  })
  return pairDir
}

describe('Vouchington patch coverage artifact fan-in', () => {
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
  })

  it('rejects a suite without a Vouchington coverage descriptor', async () => {
    const options = fixture()
    mkdirSync(join(options.sourceDir, 'coverage-unknown-suite'))
    const result = prepareCoverageArtifacts(options)
    await expect(result).rejects.toThrowError(/unknown-suite/)
    await expect(result).rejects.not.toThrowError(/^Unknown coverage suite:/)
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
        false,
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
        false,
      ),
    ).toEqual(['web-storybook', 'web-storybook-browser'])
  })

  it('only expects a portability-macos group when the runner is enabled', () => {
    expect(
      expectedCoverageProducerGroups(
        JSON.stringify({ 'test-portability': { result: 'success' } }),
        'full',
        false,
      ),
    ).toEqual(['portability-linux'])
    expect(
      expectedCoverageProducerGroups(
        JSON.stringify({ 'test-portability': { result: 'success' } }),
        'full',
        true,
      ),
    ).toEqual(['portability-linux', 'portability-macos'])
  })

  it('rejects a successful producer without a group contract', () => {
    expect(() =>
      expectedCoverageProducerGroups(
        JSON.stringify({ 'test-new-producer': { result: 'success' } }),
        'full',
        false,
      ),
    ).toThrowError('Successful coverage producer has no group contract: test-new-producer')
  })
})
