import type { CoverageSuiteDescriptor } from 'coverage-check'

import {
  projectsByJob,
  shardedCoverageJobForSuite,
  staticCoverageDescriptors,
  vitestDescriptor,
} from './coverage-suite-descriptors.mts'

export type { CoverageCollectorProfile, CoverageSuiteDescriptor } from 'coverage-check'

export function parsePositiveInt(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  const raw = value ?? String(fallback)
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new Error(`${name} must be a positive integer, got: ${JSON.stringify(raw)}`)
  }
  return Number(raw)
}

export function coverageSuiteCatalog(): readonly CoverageSuiteDescriptor[] {
  return staticCoverageDescriptors
}

export function coverageSuiteDescriptor(suite: string): CoverageSuiteDescriptor {
  const descriptor = coverageSuiteCatalog().find(candidate => candidate.suite === suite)
  if (descriptor) return descriptor
  // Promoted-full PR jobs can emit more shards than the registry default. The per-shard
  // descriptor is identical except for its report identity.
  const sharded = shardedCoverageJobForSuite(suite)
  if (sharded) {
    const { job } = sharded.coverageJob
    return vitestDescriptor(
      suite,
      job.orchestratorJob,
      projectsByJob[job.orchestratorJob],
      job.orchestratorJob === 'test-web' ? 'web' : undefined,
    )
  }
  throw new Error(`Unknown coverage suite: ${suite}`)
}

export function coverageProducerPartition(
  suite: string,
  env: NodeJS.ProcessEnv = process.env,
): { readonly group: string; readonly index: number; readonly total: number } {
  const sharded = shardedCoverageJobForSuite(suite)
  if (sharded) {
    const { shard, coverageJob } = sharded
    const expectedShard = `${shard}/`
    const total = env.CI_SHARD?.startsWith(expectedShard)
      ? parsePositiveInt(
          'CI_SHARD total',
          env.CI_SHARD.slice(expectedShard.length),
          coverageJob.policy.defaultShards,
        )
      : coverageJob.policy.defaultShards
    return {
      group: coverageJob.producerGroup,
      index: shard,
      total,
    }
  }
  coverageSuiteDescriptor(suite)
  return { group: suite, index: 1, total: 1 }
}
