import { describe, expect, it } from 'vitest'

import { hasCoverageArtifactSelection } from './coverage-artifact-selection.mts'

const selected = (suite: string): string =>
  `[optional-run-artifacts] selected artifact=coverage-${suite}\n`

describe('hasCoverageArtifactSelection()', () => {
  it.each([
    ['backend-shard-1', 'backend-shard-1'],
    ['web-shard-2', 'web-shard-2'],
    ['backend-unit', 'backend-shard-1'],
    ['web', 'web-shard-2'],
    ['lambdas', 'lambdas'],
  ])('maps producer group %s to selected suite %s', (producerGroup, suite) => {
    expect(hasCoverageArtifactSelection(selected(suite), producerGroup)).toBe(true)
  })

  it.each([
    ['backend-unit', 'backend-modules'],
    ['web', 'web-integration'],
    ['lambdas', 'unknown-suite'],
  ])('rejects unrelated suite %s for producer group %s', (producerGroup, suite) => {
    expect(hasCoverageArtifactSelection(selected(suite), producerGroup)).toBe(false)
  })
})
