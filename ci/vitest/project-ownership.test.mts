import { describe, expect, it } from 'vitest'
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
  it('gives every concrete workflow job a unique ownership row', () => {
    const jobs = VITEST_OWNERSHIP.map(job => `${job.workflow}#${job.jobLabel}`)
    expect(new Set(jobs).size).toBe(jobs.length)
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

  it('owns intentional sharding policy in the registry', () => {
    expect(shardedJobPolicies()).toEqual({
      'test-backend-unit': {
        filesPerShard: 350,
        mode: 'file-count',
        reportPrefix: 'backend-shard',
      },
      'test-web': {
        filesPerShard: 500,
        mode: 'file-count',
        reportPrefix: 'web-shard',
      },
      'test-web-api': {
        filesPerShard: 64,
        mode: 'file-count',
        reportPrefix: 'web-api-shard',
      },
      'test-web-integration': {
        mode: 'fixed',
        reportPrefix: 'web-integration-shard',
        shards: 1,
      },
    })
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
