import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import { backendCredentialedProjectNames } from '../../test-helpers/vitest-config/backend-credentialed-project-info.mts'

type Step = { run?: string; timeout?: number | string; 'timeout-minutes'?: number }
type Job = {
  if?: string
  uses?: string
  permissions?: Record<string, string>
  'timeout-minutes'?: number
  steps?: Step[]
}
type Workflow = {
  on: Record<string, { inputs?: Record<string, { options?: string[] }> } | null>
  permissions?: Record<string, string>
  jobs: Record<string, Job>
}

const read = (path: string): Workflow => load(readFileSync(path, 'utf8')) as Workflow
const workflow = read('.github/workflows/tests-backend-live-providers.yml')
const providerJobs = Object.entries(workflow.jobs).filter(([id]) => id.startsWith('backend-'))
const projectsOf = (job: Job): string[] =>
  (job.steps ?? [])
    .flatMap(step => [...(step.run ?? '').matchAll(/--project\s+(\S+)/g)])
    .map(m => m[1]!)

// The paid providers never gate a pull request or merge group: recorded responses in the unit suites
// do (docs/development/tests.md#live-provider-smoke-checks). Dispatch and the Nightly run are the
// only entry points.
describe('backend live-provider workflow', () => {
  it('is reachable only by dispatch and as a called workflow, never from a PR or merge group', () => {
    expect(Object.keys(workflow.on).toSorted()).toEqual(['workflow_call', 'workflow_dispatch'])

    const callers = ['.github/workflows/nightly.yml', '.github/workflows/backend.yml'].map(
      path =>
        [
          path,
          Object.values(read(path).jobs).filter(job =>
            job.uses?.endsWith('tests-backend-live-providers.yml'),
          ),
        ] as const,
    )
    expect(callers.map(([path, jobs]) => [path, jobs.length])).toEqual([
      ['.github/workflows/nightly.yml', 1],
      ['.github/workflows/backend.yml', 0],
    ])
  })

  it('runs every paid credentialed project except real AWS S3 in its own job, exactly once', () => {
    const paid = backendCredentialedProjectNames.filter(name => name !== 'backend-aws')

    expect(providerJobs.map(([, job]) => projectsOf(job))).toEqual(
      expect.arrayContaining(paid.map(name => [name])),
    )
    expect(providerJobs.flatMap(([, job]) => projectsOf(job)).toSorted()).toEqual(paid.toSorted())
  })

  it('lets a dispatch pick one provider or all, and selects each job by that input', () => {
    const options = workflow.on.workflow_dispatch?.inputs?.provider?.options ?? []

    expect(options.toSorted()).toEqual(
      ['all', ...providerJobs.map(([id]) => id.replace('backend-', ''))].toSorted(),
    )
    for (const [id, job] of providerJobs) {
      expect(job.if).toContain(`inputs.provider == '${id.replace('backend-', '')}'`)
    }
  })

  it('grants OIDC only to jobs that exchange a token, never at workflow level', () => {
    expect(workflow.permissions).not.toHaveProperty('id-token')
    expect(
      providerJobs.filter(([, job]) => job.permissions?.['id-token'] === 'write').map(([id]) => id),
    ).toEqual(['backend-bedrock', 'backend-anthropic'])
  })

  it('bounds every job below the sum of its step deadlines', () => {
    for (const [, job] of providerJobs) {
      const total = (job.steps ?? []).reduce((sum, step) => sum + (step['timeout-minutes'] ?? 0), 0)
      expect(job.steps?.every(step => step['timeout-minutes'] !== undefined)).toBe(true)
      expect(job['timeout-minutes']).toBeLessThan(total)
    }
  })
})
