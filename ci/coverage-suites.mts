import type { CoverageSuiteDescriptor } from 'coverage-check'

import {
  projectsByJob,
  shardedCoverageJobForSuite,
  staticCoverageDescriptors,
  vitestDescriptor,
} from './coverage-suite-descriptors.mts'

export type { CoverageCollectorProfile, CoverageSuiteDescriptor } from 'coverage-check'

export function coverageSuiteCatalog(): readonly CoverageSuiteDescriptor[] {
  return staticCoverageDescriptors
}

export function coverageSuiteDescriptor(suite: string): CoverageSuiteDescriptor {
  const descriptor = coverageSuiteCatalog().find(candidate => candidate.suite === suite)
  if (descriptor) return descriptor
  // Live-sized and selected PR jobs can emit any valid shard number. The per-shard descriptor is
  // identical except for its report identity.
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
    const match = new RegExp(`^${shard}/([1-9][0-9]*)$`).exec(env.CI_SHARD ?? '')
    if (!match) {
      throw new Error(`CI_SHARD must identify ${shard}/<positive total> for ${suite}`)
    }
    const total = Number(match[1])
    if (total < shard) throw new Error(`CI_SHARD total must include shard ${shard} for ${suite}`)
    return {
      group: coverageJob.producerGroup,
      index: shard,
      total,
    }
  }
  coverageSuiteDescriptor(suite)
  return { group: suite, index: 1, total: 1 }
}

export function coverageProducerGroup(suite: string): string {
  const sharded = shardedCoverageJobForSuite(suite)
  if (sharded) return sharded.coverageJob.producerGroup
  coverageSuiteDescriptor(suite)
  return suite
}
