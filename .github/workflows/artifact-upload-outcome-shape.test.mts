import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import {
  artifactUploadOutcomeViolations,
  outcomeSteps,
} from '../../ci/workflow-artifact-outcome-policy.mts'

const EXPECTED_RUN =
  'node ci/artifact-upload-outcome.mts "$FAMILY" "$SUITE" "$FIRST_OUTCOME" "$RETRY_OUTCOME"'
const PRODUCER_SUITES = [
  'backend-modules',
  'backend-native-migrations',
  'backend-native-mv',
  'backend-shard-${{ matrix.shard }}',
  'cloudflare-worker',
  'lambdas',
  'portability-linux',
  'tooling',
  'ts-shared',
  'web-api-shard-${{ matrix.shard }}',
  'web-integration-shard-${{ matrix.shard }}',
  'web-shard-${{ matrix.shard }}',
  'web-storybook',
  'web-storybook-browser',
]

const STEP = {
  run: EXPECTED_RUN,
  env: {
    FAMILY: 'full-lcov',
    FIRST_OUTCOME: '${{ steps.first.outcome }}',
    RETRY_OUTCOME: '${{ steps.retry.outcome }}',
    SUITE: 'backend-modules',
  },
}

describe('artifact-upload-outcome.mts call sites', () => {
  it('keeps all fourteen literal producer suites and their env shape', () => {
    const files = [
      {
        path: '.github/workflows/fixture.yml',
        source: stringify({
          jobs: {
            upload: {
              steps: PRODUCER_SUITES.map(suite => ({
                ...STEP,
                env: { ...STEP.env, SUITE: suite },
              })),
            },
          },
        }),
      },
    ]
    const steps = outcomeSteps(files)

    expect(steps).toHaveLength(14)
    expect(
      steps
        .map(step => step.env?.SUITE)
        .toSorted((a, b) => Number(String(a) > String(b)) - Number(String(a) < String(b))),
    ).toEqual([
      'backend-modules',
      'backend-native-migrations',
      'backend-native-mv',
      'backend-shard-${{ matrix.shard }}',
      'cloudflare-worker',
      'lambdas',
      'portability-linux',
      'tooling',
      'ts-shared',
      'web-api-shard-${{ matrix.shard }}',
      'web-integration-shard-${{ matrix.shard }}',
      'web-shard-${{ matrix.shard }}',
      'web-storybook',
      'web-storybook-browser',
    ])
    for (const step of steps) {
      expect(step.run).toBe(EXPECTED_RUN)
      expect(Object.keys(step.env ?? {}).toSorted()).toEqual([
        'FAMILY',
        'FIRST_OUTCOME',
        'RETRY_OUTCOME',
        'SUITE',
      ])
      const env = step.env ?? {}
      expect(env.FAMILY).toBe('full-lcov')
      expect(typeof env.SUITE).toBe('string')
      expect((env.SUITE as string).length).toBeGreaterThan(0)
      expect(env.FIRST_OUTCOME).toMatch(/^\$\{\{ steps\.[\w-]+\.outcome \}\}$/)
      expect(env.RETRY_OUTCOME).toMatch(/^\$\{\{ steps\.[\w-]+\.outcome \}\}$/)
    }
    expect(artifactUploadOutcomeViolations(files)).toEqual([])
  })

  it('rejects a missing producer and malformed outcome env', () => {
    const files = [
      {
        path: '.github/workflows/fixture.yml',
        source: stringify({
          jobs: {
            upload: { steps: [{ ...STEP, env: { ...STEP.env, FIRST_OUTCOME: 'success' } }] },
          },
        }),
      },
    ]
    expect(artifactUploadOutcomeViolations(files)).toContain(
      'Artifact outcome FIRST_OUTCOME must reference a step outcome',
    )
    expect(artifactUploadOutcomeViolations(files)).toContain(
      'Expected 14 artifact outcome steps, got 1',
    )
  })
})
