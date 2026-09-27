import { describe, expect, it } from 'vitest'

import { makeCtx } from '../test-helpers/transient-retry/helpers.mts'
import { isAreaGateJob } from './ci-aggregate-jobs.mts'
import { decide } from './decide.mts'
import { RULES } from './rules.mts'

const backendJob = 'test-backend-unit / backend-tests (1)'
const shutdownLog = [
  'pnpm exec ./ci/with-node-test-options vitest run --project backend-data-stores',
  '##[error]The runner has received a shutdown signal.',
  '##[error]The operation was canceled.',
].join('\n')

describe('area gate classification', () => {
  it.each([
    ['Static', 'static'],
    ['Backend', 'backend'],
    ['Web', 'web'],
    ['Cloudflare Worker', 'cloudflare-worker'],
    ['Lambdas', 'lambdas'],
    ['Tooling', 'tooling'],
  ])('recognizes only the %s workflow gate', (workflow, gate) => {
    expect(isAreaGateJob(workflow, gate)).toBe(true)
    expect(isAreaGateJob(workflow, 'unknown')).toBe(false)
    expect(isAreaGateJob('Main CI (backend)', gate)).toBe(false)
    expect(isAreaGateJob('unknown', gate)).toBe(false)
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
