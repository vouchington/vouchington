// Derived collections over ci/vitest/project-ownership.mts's raw VITEST_OWNERSHIP data —
// mirrors the tooling-project-policies.mts / tooling-project-registry.mts split. Consume these
// instead of walking VITEST_OWNERSHIP directly so each consumer reads one computed shape per
// concern rather than re-deriving it ad hoc.
import { VITEST_OWNERSHIP } from './project-ownership.mts'
import type { VitestShardPolicy } from './project-ownership-types.mts'

function memoize<T>(compute: () => T): () => T {
  let cache: { value: T } | undefined
  return () => {
    // Re-invokes compute() if it throws (cache stays undefined after throw).
    cache ??= { value: compute() }
    return cache.value
  }
}

// Every project name -> its one owning orchestratorJob. Throws at first call if a project
// appears under more than one job, so a bad model edit fails loudly instead of silently
// picking a winner.
export const projectToJob = memoize((): Record<string, string> => {
  const map: Record<string, string> = {}
  for (const job of VITEST_OWNERSHIP) {
    for (const { project } of job.projects) {
      if (Object.hasOwn(map, project)) {
        throw new Error(`Vitest project "${project}" is owned by more than one CI job`)
      }
      map[project] = job.orchestratorJob
    }
  }
  return map
})

// Per-job sharding policy derived from the ownership registry. This makes a missing matrix or
// report configuration an invalid model state rather than an ad-hoc workflow default.
export const shardedJobPolicies = memoize((): Readonly<Record<string, VitestShardPolicy>> => {
  const policies: Record<string, VitestShardPolicy> = {}
  for (const job of VITEST_OWNERSHIP) {
    if (job.sharding === undefined) continue
    policies[job.orchestratorJob] = job.sharding
  }
  return policies
})
