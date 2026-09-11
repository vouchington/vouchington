import { describe, expect, it } from 'vitest'
import { countJobSuiteFiles } from './job-suite-count.mts'
import { VITEST_OWNERSHIP } from './project-ownership.mts'
import {
  allOwnedProjects,
  projectToJob,
  shardedJobPolicies,
  shardedJobs,
  sideDutyJobs,
  storybookBrowserProject,
  storybookJob,
} from './project-ownership-registry.mts'

describe('VITEST_OWNERSHIP', () => {
  it('gives every job a unique orchestratorJob and workflow', () => {
    const jobs = VITEST_OWNERSHIP.map(job => job.orchestratorJob)
    const workflows = VITEST_OWNERSHIP.map(job => job.workflow)
    expect(new Set(jobs).size).toBe(jobs.length)
    expect(new Set(workflows).size).toBe(workflows.length)
  })

  it('gives every job at least one project', () => {
    for (const job of VITEST_OWNERSHIP) {
      expect(job.projects.length).toBeGreaterThan(0)
    }
  })

  it('owns every project exactly once across all jobs', () => {
    const seen = new Set<string>()
    const duplicates: string[] = []
    for (const job of VITEST_OWNERSHIP) {
      for (const { project } of job.projects) {
        if (seen.has(project)) duplicates.push(project)
        seen.add(project)
      }
    }
    expect(duplicates).toEqual([])
  })

  it('flags exactly one project as the storybook browser runner', () => {
    const flagged = VITEST_OWNERSHIP.flatMap(job =>
      job.projects.filter(project => project.browserRunner),
    )
    expect(flagged.map(project => project.project)).toEqual(['web-storybook-browser'])
  })

  it('derives tooling-registry and portability-group jobs from their canonical sources, not a re-hardcoded list', () => {
    const tooling = VITEST_OWNERSHIP.find(job => job.invocation === 'tooling-registry')
    const portability = VITEST_OWNERSHIP.find(job => job.invocation === 'portability-group')
    expect(tooling?.projects.length).toBeGreaterThan(0)
    expect(portability?.projects.length).toBeGreaterThan(0)
  })
})

describe('project-ownership-registry derivations', () => {
  it('projectToJob covers every project in the model exactly once', () => {
    const map = projectToJob()
    expect(Object.keys(map).toSorted()).toEqual([...allOwnedProjects()].toSorted())
    for (const job of VITEST_OWNERSHIP) {
      for (const { project } of job.projects) {
        expect(map[project]).toBe(job.orchestratorJob)
      }
    }
  })

  it('shardedJobs matches the jobs with sharding policy in the model', () => {
    expect(new Set(shardedJobs())).toEqual(
      new Set(
        VITEST_OWNERSHIP.filter(job => job.sharding !== undefined).map(job => job.orchestratorJob),
      ),
    )
  })

  it('owns the sharding defaults and selection budgets in the registry', () => {
    expect(shardedJobPolicies()).toEqual({
      'test-backend-unit': {
        defaultShards: 5,
        filesPerShard: 520,
        mode: 'file-count',
        reportPrefix: 'backend-shard',
      },
      'test-web': {
        defaultShards: 2,
        filesPerShard: 800,
        mode: 'file-count',
        reportPrefix: 'web-shard',
      },
      'test-web-api': {
        defaultShards: 1,
        filesPerShard: 64,
        mode: 'file-count',
        reportPrefix: 'web-api-shard',
      },
      'test-web-integration': {
        defaultShards: 1,
        mode: 'fixed',
        reportPrefix: 'web-integration-shard',
      },
    })
  })

  it('keeps defaultShards consistent with ceil(live file count / filesPerShard) for every file-count job', () => {
    // Prevents the test-backend-unit drift this policy fixed: the registry previously claimed
    // defaultShards: 8 while filesPerShard: 300 against the real suite implied 9, and the push-path
    // workflow YAML's own `|| 8` fallback (not this formula) was silently the one actually governing
    // production. Re-deriving defaultShards from filesPerShard here means the two can never diverge.
    const counts = countJobSuiteFiles(process.cwd())
    for (const job of VITEST_OWNERSHIP) {
      if (job.sharding?.mode !== 'file-count') continue
      const fileCount = counts.get(job.orchestratorJob)
      expect(fileCount).toBeGreaterThan(0)
      const expectedShards = Math.ceil((fileCount ?? 0) / job.sharding.filesPerShard)
      expect(job.sharding.defaultShards).toBe(expectedShards)
    }
  })

  it('sideDutyJobs matches the jobs flagged sideDuty in the model', () => {
    expect(sideDutyJobs()).toEqual(
      new Set(VITEST_OWNERSHIP.filter(job => job.sideDuty).map(job => job.orchestratorJob)),
    )
  })

  it('storybookJob resolves the job whose invocation is "storybook"', () => {
    expect(storybookJob()).toBe('storybook')
  })

  it('storybookBrowserProject resolves the flagged browser-runner project', () => {
    expect(storybookBrowserProject()).toBe('web-storybook-browser')
  })

  it('allOwnedProjects has no duplicates and matches projectToJob key count', () => {
    const projects = allOwnedProjects()
    expect(new Set(projects).size).toBe(projects.length)
    expect(projects.length).toBe(Object.keys(projectToJob()).length)
  })
})
