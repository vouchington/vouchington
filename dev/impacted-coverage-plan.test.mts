import { describe, expect, it } from 'vitest'
import { impactedCoverageAreas, localCoverageProjects } from './impacted-coverage-plan.mts'

describe('local patch coverage planning', () => {
  it('preserves first-match ownership and still runs backend caller assertions', () => {
    const rules = {
      rules: [
        { paths: 'lambdas/host.mts', patch_coverage_min: 100, area: 'tooling' },
        { paths: 'lambdas/**', patch_coverage_min: 100, area: 'lambdas' },
        { paths: 'backend/scripts/**', patch_coverage_min: 0 },
      ],
    }
    expect(
      impactedCoverageAreas(['lambdas/host.mts', 'backend/scripts/caller.mts'], rules),
    ).toEqual(['backend', 'tooling'])
    expect(() =>
      impactedCoverageAreas(['lambdas/file.mts'], {
        rules: [{ paths: '**', patch_coverage_min: 100, area: 'unknown' }],
      }),
    ).toThrow('Unknown patch coverage owner')
  })

  it('derives full producer projects from area workflow calls, never paid or unrelated suites', () => {
    const workflow = {
      jobs: {
        producer: { uses: './.github/workflows/tests-area.yml', with: { publish_coverage: true } },
        other: { uses: './.github/workflows/tests-other.yml' },
      },
    }
    const ownership = [
      {
        workflow: 'tests-area.yml',
        orchestratorJob: 'area',
        jobLabel: 'area',
        invocation: 'literal' as const,
        projects: [
          { project: 'caller-suite', credential: 'None' },
          { project: 'another-suite', credential: 'None' },
        ],
      },
      {
        workflow: 'tests-other.yml',
        orchestratorJob: 'other',
        jobLabel: 'other',
        invocation: 'literal' as const,
        projects: [{ project: 'paid', credential: 'provider token' }],
      },
    ]
    expect(
      localCoverageProjects(workflow, ownership).projects.map(project => project.project),
    ).toEqual(['caller-suite', 'another-suite'])
    expect(() =>
      localCoverageProjects(
        workflow,
        ownership.map(job => ({
          ...job,
          projects: [{ project: 'needs-token', credential: 'provider token' }],
        })),
      ),
    ).toThrow('Coverage producer needs credentials')
  })

  it('preserves CI collector scopes instead of crediting unpublished coverage', () => {
    const ownership = [
      {
        workflow: 'tooling.yml',
        orchestratorJob: 'tooling',
        jobLabel: 'tools',
        invocation: 'tooling-registry' as const,
        projects: [{ project: 'tools', credential: 'None' }],
      },
      {
        workflow: 'tooling.yml',
        orchestratorJob: 'tooling',
        jobLabel: 'dedicated',
        invocation: 'literal' as const,
        projects: [{ project: 'bounds', credential: 'None' }],
      },
      {
        workflow: 'host.yml',
        orchestratorJob: 'host',
        jobLabel: 'host',
        invocation: 'portability-group' as const,
        projects: [{ project: 'host', credential: 'None' }],
      },
      {
        workflow: 'stories.yml',
        orchestratorJob: 'stories',
        jobLabel: 'stories',
        invocation: 'storybook' as const,
        projects: [{ project: 'stories', credential: 'None' }],
      },
    ]
    const workflow = {
      jobs: Object.fromEntries(
        ownership.map(job => [
          job.jobLabel,
          {
            uses: `./.github/workflows/${job.workflow}`,
            with: { publish_coverage: true },
          },
        ]),
      ),
    }
    expect(
      localCoverageProjects(workflow, ownership).projects.map(project => project.coverageScope),
    ).toEqual(['tooling', 'tooling', 'portability', 'stories'])
  })
})
