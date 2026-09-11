import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { normalizeRetryArtifactDirectories } from './normalize-retry-artifact-directories.mts'

const roots: string[] = []

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'normalize-retry-artifact-directories-'))
  roots.push(root)
  return root
}

function makeSuiteDir(root: string, name: string): void {
  const dir = join(root, name)
  mkdirSync(dir)
  writeFileSync(join(dir, 'marker.json'), '{}\n')
}

describe('normalizeRetryArtifactDirectories', () => {
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true })
  })

  it('strips a trailing -retry suffix off a downloaded directory', () => {
    const root = makeRoot()
    makeSuiteDir(root, 'coverage-web-api-shard-2-retry')

    normalizeRetryArtifactDirectories(root)

    expect(readdirSync(root).sort()).toEqual(['coverage-web-api-shard-2'])
  })

  it('is a no-op when the root does not exist', () => {
    const root = join(makeRoot(), 'does-not-exist')

    expect(() => normalizeRetryArtifactDirectories(root)).not.toThrow()
  })

  it('is a no-op when no entries carry a -retry suffix', () => {
    const root = makeRoot()
    makeSuiteDir(root, 'coverage-web')
    makeSuiteDir(root, 'coverage-tooling')

    normalizeRetryArtifactDirectories(root)

    expect(readdirSync(root).sort()).toEqual(['coverage-tooling', 'coverage-web'])
  })

  it('keeps the primary and discards the retry when both are present', () => {
    const root = makeRoot()
    makeSuiteDir(root, 'coverage-web')
    writeFileSync(join(root, 'coverage-web', 'marker.json'), '{"attempt":"latest"}\n')
    makeSuiteDir(root, 'coverage-web-retry')

    expect(() => normalizeRetryArtifactDirectories(root)).not.toThrow()

    expect(readdirSync(root).sort()).toEqual(['coverage-web'])
    expect(readFileSync(join(root, 'coverage-web', 'marker.json'), 'utf8')).toBe(
      '{"attempt":"latest"}\n',
    )
  })

  it('normalizes multiple independent retry directories in one pass', () => {
    const root = makeRoot()
    makeSuiteDir(root, 'vitest-report-attempt-web-retry')
    makeSuiteDir(root, 'vitest-report-attempt-tooling')
    makeSuiteDir(root, 'coverage-backend-modules-retry')

    normalizeRetryArtifactDirectories(root)

    expect(readdirSync(root).sort()).toEqual([
      'coverage-backend-modules',
      'vitest-report-attempt-tooling',
      'vitest-report-attempt-web',
    ])
  })
})
