// Derived collections over ci/vitest/project-ownership.mts's raw VITEST_OWNERSHIP data —
// mirrors the tooling-project-policies.mts / tooling-project-registry.mts split. Consume these
// instead of walking VITEST_OWNERSHIP directly so ci-select.mts (and any future consumer) reads
// one computed shape per concern rather than re-deriving it ad hoc.
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

export const shardedJobs = memoize((): string[] => {
  const jobs: string[] = []
  for (const job of VITEST_OWNERSHIP) {
    if (job.sharding !== undefined) jobs.push(job.orchestratorJob)
  }
  return jobs
})

// Per-job sharding policy derived from the ownership registry. This makes a missing selection,
// matrix, or report configuration an invalid model state rather than an ad-hoc workflow default.
export const shardedJobPolicies = memoize((): Readonly<Record<string, VitestShardPolicy>> => {
  const policies: Record<string, VitestShardPolicy> = {}
  for (const job of VITEST_OWNERSHIP) {
    if (job.sharding === undefined) continue
    policies[job.orchestratorJob] = job.sharding
  }
  return policies
})

export const sideDutyJobs = memoize((): Set<string> => {
  const jobs = new Set<string>()
  for (const job of VITEST_OWNERSHIP) {
    if (job.sideDuty) jobs.add(job.orchestratorJob)
  }
  return jobs
})

export const storybookJob = memoize((): string => {
  const job = VITEST_OWNERSHIP.find(candidate => candidate.invocation === 'storybook')
  if (!job) throw new Error('No job with invocation "storybook" is registered')
  return job.orchestratorJob
})

export const storybookBrowserProject = memoize((): string => {
  for (const job of VITEST_OWNERSHIP) {
    const browserProject = job.projects.find(project => project.browserRunner)
    if (browserProject) return browserProject.project
  }
  throw new Error('No project is flagged browserRunner')
})

export const allOwnedProjects = memoize((): string[] =>
  VITEST_OWNERSHIP.flatMap(job => job.projects.map(project => project.project)),
)
