import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { makeCtx } from '../test-helpers/transient-retry/helpers.mts'
import { isAreaGateJob } from './ci-aggregate-jobs.mts'
import { decide } from './decide.mts'
import { RULES } from './rules.mts'

type Workflow = {
  name?: string
  jobs?: Record<string, { name?: string; steps?: Array<{ uses?: string }> }>
}

const workflowsDir = '.github/workflows'
// Match the action path, not its pinned SHA, so a tooling bump keeps the contract intact.
const resultGateAction = 'vouchington/vouchington-tooling/.github/actions/ci-required-result-gate@'

// The classifier sees the reported check name, which is the gate job's `name:` when it has one.
const gatedWorkflows = readdirSync(workflowsDir)
  .filter(file => file.endsWith('.yml'))
  .map(file => parse(readFileSync(`${workflowsDir}/${file}`, 'utf8')) as Workflow)
  .map(({ name, jobs }) => ({
    workflow: name ?? '',
    gates: Object.entries(jobs ?? {})
      .filter(([, job]) => job.steps?.some(step => step.uses?.startsWith(resultGateAction)))
      .map(([id, job]) => job.name ?? id),
  }))
  .filter(({ gates }) => gates.length > 0)
const areaGates = gatedWorkflows.flatMap(({ workflow, gates }) =>
  gates.map(gate => ({ workflow, gate })),
)

const backendJob = 'test-backend-unit / backend-tests (1)'
const shutdownLog = [
  'pnpm exec ./ci/with-node-test-options vitest run --project backend-data-stores',
  '##[error]The runner has received a shutdown signal.',
  '##[error]The operation was canceled.',
].join('\n')

describe('area gate classification', () => {
  it('derives exactly one required gate from each of the six area workflows', () => {
    expect(gatedWorkflows).toHaveLength(6)
    expect(gatedWorkflows.filter(({ gates }) => gates.length !== 1)).toEqual([])
  })

  it.each(areaGates)('recognizes only the $workflow workflow gate', ({ workflow, gate }) => {
    expect(isAreaGateJob(workflow, gate)).toBe(true)
    expect(isAreaGateJob(workflow, 'unknown')).toBe(false)
    expect(isAreaGateJob('Main CI (backend)', gate)).toBe(false)
    expect(isAreaGateJob('unknown', gate)).toBe(false)
    for (const other of areaGates.filter(other => other.workflow !== workflow)) {
      expect(isAreaGateJob(workflow, other.gate)).toBe(false)
      expect(isAreaGateJob(other.workflow, gate)).toBe(false)
    }
  })

  it.each([
    ['Backend', 'backend', 'rerun'],
    ['Backend', 'web', 'dispatch'],
    ['Main CI (backend)', 'backend', 'dispatch'],
    ['Backend', 'coverage / Patch Coverage', 'dispatch'],
  ])('keeps %s companion %s scoped to its real DAG', async (workflowName, companion, decision) => {
    await expect(
      decide(
        makeCtx({
          workflowName,
          failedJobNames: [backendJob, companion],
          failedJobLogs: async () => new Map([[backendJob, shutdownLog]]),
        }),
        RULES,
      ),
    ).resolves.toMatchObject({ decision })
  })
})
