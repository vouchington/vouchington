import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const backendUnitShardJobName = 'test-backend-unit / backend-tests (1)'
const backendSmokeJobName = 'backend-smoke / smoke'

const sigtermOnlyShutdownLog = [
  '##[error]The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled.',
  '##[error]Process completed with exit code 143.',
].join('\n')

const backendUnitSigtermOnlyLog = [
  'pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project backend-data-stores --shard 1/2 --coverage',
  'Test Files  828 passed | 2 skipped (830)',
  'Tests       5876 passed | 9 skipped (5885)',
  sigtermOnlyShutdownLog,
].join('\n')

const makeCtx = (
  log = backendUnitSigtermOnlyLog,
  jobName = backendUnitShardJobName,
): WorkflowRunContext => ({
  workflowName: 'Main CI (backend)',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [jobName],
  failedJobLogs: () => Promise.resolve(new Map([[jobName, log]])),
  failedJobAnnotations: () => Promise.resolve([]),
})

describe('runner-shutdown-leaf-rerun SIGTERM-only variant', () => {
  it('reruns backend-unit when SIGTERM is emitted without an operation-canceled line', async () => {
    const result = await decide(makeCtx(), RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-shutdown-leaf-rerun')
  })

  it('does NOT rerun backend-smoke when a smoke-test failure precedes SIGTERM-only shutdown', async () => {
    const result = await decide(
      makeCtx(`✗ Error: worker startup timed out\n${sigtermOnlyShutdownLog}`, backendSmokeJobName),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does NOT rerun backend-smoke when migration fails before shutdown', async () => {
    const result = await decide(
      makeCtx(
        `ERROR: running migration 20260823000000-example.sql failed!\n${sigtermOnlyShutdownLog}`,
        backendSmokeJobName,
      ),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
