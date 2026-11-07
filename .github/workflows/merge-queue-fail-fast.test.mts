import { readFileSync } from 'node:fs'

import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

type Job = {
  if?: string
  name?: string
  needs?: string | string[]
  permissions?: Record<string, string>
  steps?: Array<{ uses?: string; env?: Record<string, string> }>
  'runs-on'?: string
}
type Workflow = { name?: string; on?: Record<string, unknown>; jobs: Record<string, Job> }
type Policy = { rule?: string; options?: { requiredJobs?: string[] } }

const readWorkflow = (path: string): Workflow => parse(readFileSync(path, 'utf8')) as Workflow
const sweeper = readWorkflow('.github/workflows/merge-queue-fail-fast.yml')
const sweep = sweeper.jobs.sweep
const env = sweep?.steps?.[0]?.env ?? {}

// The required area gates, as `<workflow path>#<gate job>`.
const requiredGates =
  (parse(readFileSync('.no-mistakes/rules/policies.yml', 'utf8')) as Policy[]).find(
    policy => policy.rule === 'workflow-topology-policy',
  )?.options?.requiredJobs ?? []

const areas = requiredGates.map(gate => {
  const [path = '', gateJob = ''] = gate.split('#')
  const workflow = readWorkflow(path)
  const gating = new Set([gateJob, ...[workflow.jobs[gateJob]?.needs ?? []].flat()])
  const nonGating = Object.keys(workflow.jobs).filter(job => !gating.has(job))
  return { path, workflow, nonGating }
})

describe('merge-queue fail fast workflow', () => {
  it('sweeps on a schedule instead of waiting inside a job', () => {
    expect(Object.keys(sweeper.on ?? {}).toSorted()).toEqual(['schedule', 'workflow_dispatch'])
  })

  it('lets every required gate fail on a cancelled merge group, and only there', () => {
    expect(
      requiredGates.filter(gate => {
        const [path = '', job = ''] = gate.split('#')
        return (
          readWorkflow(path).jobs[job]?.if !==
          "${{ !cancelled() || github.event_name == 'merge_group' }}"
        )
      }),
    ).toEqual([])
  })

  it('watches exactly the workflows that run a required gate on merge_group', () => {
    expect(areas.length).toBeGreaterThan(0)
    expect(
      areas.filter(({ workflow }) => !Object.keys(workflow.on ?? {}).includes('merge_group')),
    ).toEqual([])
    expect(new Set(JSON.parse(env.AREA_WORKFLOWS ?? '[]'))).toEqual(
      new Set(areas.map(({ workflow }) => workflow.name)),
    )
  })

  it('ignores exactly the jobs no required gate waits on', () => {
    expect(new Set(JSON.parse(env.NON_GATING_JOBS ?? '[]'))).toEqual(
      new Set(areas.flatMap(({ nonGating }) => nonGating)),
    )
    // The sweep matches check-run names by job id, which a display `name:` would replace.
    expect(
      areas.flatMap(({ path, workflow, nonGating }) =>
        nonGating.filter(job => workflow.jobs[job]?.name).map(job => `${path}#${job}`),
      ),
    ).toEqual([])
  })

  it('cancels runs with no checkout and only the permissions it uses', () => {
    expect(sweep?.permissions).toEqual({ actions: 'write', checks: 'read' })
    expect(sweep?.steps?.some(step => step.uses?.startsWith('actions/checkout@'))).toBe(false)
  })
})
