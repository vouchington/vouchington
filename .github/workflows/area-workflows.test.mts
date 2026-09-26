import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Job = {
  if?: string
  name?: string
  needs?: string | string[]
  permissions?: Record<string, string>
  secrets?: Record<string, string>
  steps?: Array<{ uses?: string; with?: Record<string, unknown> }>
  uses?: string
}
type Workflow = {
  concurrency?: { group?: string; 'cancel-in-progress'?: unknown }
  jobs?: Record<string, Job>
  on?: Record<string, { secrets?: Record<string, unknown>; types?: string[] } | null>
  permissions?: unknown
}

const workflowsDir = '.github/workflows'
const detectChanges = './.github/workflows/ci-detect-changes.yml'
const resultGateAction = 'vouchington/vouchington-tooling/.github/actions/ci-required-result-gate@'
// Jobs that consume suite results rather than run a suite.
const fanIns = new Set(['coverage', 'codecov'])

const readWorkflow = (path: string): Workflow => load(readFileSync(path, 'utf8')) as Workflow
const needsOf = (job: Job): string[] => [job.needs ?? []].flat()
const nightly = readWorkflow(`${workflowsDir}/nightly.yml`)
const areas = Object.entries(nightly.jobs ?? {}).map(([id, job]) => ({
  area: id,
  caller: job,
  workflow: readWorkflow(job.uses!.slice(2)),
}))
// Every area but static selects itself from the changed files.
const selectedAreas = areas.filter(({ area }) => area !== 'static')

describe('area workflows', () => {
  it('runs every area workflow from nightly, one job per area', () => {
    expect(Object.keys(nightly.on ?? {}).toSorted()).toEqual(['schedule', 'workflow_dispatch'])
    expect(nightly.concurrency?.['cancel-in-progress']).toBe(false)
    expect(areas.map(({ area }) => area).toSorted()).toEqual([
      'backend',
      'cloudflare-worker',
      'lambdas',
      'static',
      'tooling',
      'web',
    ])
    for (const { area, caller } of areas) {
      expect(caller.uses).toBe(`./.github/workflows/${area}.yml`)
    }
  })

  // A reusable workflow's secrets and permissions are capped by its caller, so a gap here fails
  // only the nightly run.
  it.each(areas)('passes $area every secret and permission it needs', ({ caller, workflow }) => {
    const secrets = Object.keys(workflow.on?.workflow_call?.secrets ?? {})
    const permissionGaps = Object.values(workflow.jobs ?? {})
      .flatMap(job => Object.entries(job.permissions ?? {}))
      .filter(([scope, level]) => {
        const granted = caller.permissions?.[scope]
        return granted === undefined || (level === 'write' && granted !== 'write')
      })

    expect(caller.secrets ?? {}).toEqual(
      Object.fromEntries(secrets.map(secret => [secret, `\${{ secrets.${secret} }}`])),
    )
    expect(permissionGaps).toEqual([])
  })

  // A trigger-level `paths:` filter would leave a skipped area's required check pending forever,
  // and draft transitions must not start runs.
  it.each(areas)('triggers $area on every pull request and merge group', ({ workflow }) => {
    expect(Object.keys(workflow.on ?? {}).toSorted()).toEqual([
      'merge_group',
      'pull_request',
      'workflow_call',
      'workflow_dispatch',
    ])
    expect(workflow.on?.pull_request).toEqual({ types: ['opened', 'synchronize', 'reopened'] })
    expect(workflow.on?.merge_group).toEqual({ types: ['checks_requested'] })
    expect(workflow.permissions).toEqual({})
  })

  // Under workflow_call, github.workflow names the caller, so every nightly call would share it.
  it.each(areas)('gives $area a literal concurrency prefix', ({ area, workflow }) => {
    expect(workflow.concurrency).toEqual({
      group: `${area}-\${{ github.event_name }}-\${{ github.event.pull_request.number || github.sha }}`,
      'cancel-in-progress': "${{ github.event_name == 'pull_request' }}",
    })
  })

  it.each(selectedAreas)('orders $area as changes, static, suites', ({ area, workflow }) => {
    const jobs = workflow.jobs ?? {}
    const selected = `needs.changes.outputs.area-${area} == 'true'`
    const staticJobs = Object.keys(jobs).filter(id => id === `static-${area}`)
    const suites = Object.keys(jobs).filter(
      id => ![area, 'changes', ...staticJobs].includes(id) && !fanIns.has(id),
    )
    const suiteShape = (id: string) => {
      const needs = needsOf(jobs[id]!)
      return {
        id,
        // A suite waits only for the area selection and its static checks, never another suite.
        waitsOnSelectionOnly: needs.every(need => need === 'changes' || staticJobs.includes(need)),
        // The area static checks gate it; without them, it selects the area itself.
        gated:
          staticJobs.length > 0
            ? staticJobs.every(job => needs.includes(job))
            : (jobs[id]!.if?.includes(selected) ?? false),
      }
    }

    expect(jobs.changes?.uses).toBe(detectChanges)
    expect(staticJobs.map(id => ({ id, needs: needsOf(jobs[id]!), if: jobs[id]!.if }))).toEqual(
      staticJobs.map(id => ({ id, needs: ['changes'], if: selected })),
    )
    expect(suites.map(suiteShape)).toEqual(
      suites.map(id => ({ id, waitsOnSelectionOnly: true, gated: true })),
    )
  })

  // no-mistakes' tsconfig-gate-coverage counts the repository typechecks only through a root that
  // reaches them provably, and a `needs:` on the reusable changes job defeats that.
  it('runs static analysis on every change without a changes job', () => {
    const jobs = areas.find(({ area }) => area === 'static')!.workflow.jobs ?? {}
    const analysis = jobs['static-code-analysis']!

    expect(Object.keys(jobs).toSorted()).toEqual(['static', 'static-code-analysis'])
    expect(analysis.uses).toBe('./.github/workflows/static-code-analysis.yml')
    expect(needsOf(analysis)).toEqual([])
    expect(analysis.if).toBeUndefined()
  })

  // The gate is the required check: named after the area, always running, and fed every job
  // except the informational Codecov upload.
  it.each(areas)('gates $area on every blocking job', ({ area, workflow }) => {
    const jobs = workflow.jobs ?? {}
    const gate = jobs[area]!
    const gateStep = gate.steps?.find(step => step.uses?.startsWith(resultGateAction))
    const results = JSON.parse(String(gateStep?.with?.results)) as Record<string, unknown>
    const expected = Object.keys(jobs).filter(id => id !== area && id !== 'codecov')
    expect(gate.name).toBe(area)
    expect(gate.if).toBe('${{ !cancelled() }}')
    expect(needsOf(gate).toSorted()).toEqual(expected.toSorted())
    expect(Object.keys(results).toSorted()).toEqual(expected.toSorted())
  })
})
