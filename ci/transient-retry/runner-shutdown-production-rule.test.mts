import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const backendUnitJobName = 'test-backend-unit / backend-tests (1)'
const cleanCancellationLog = [
  'pnpm exec ./ci/with-node-test-options vitest run --project backend-data-stores',
  '##[error]The runner has received a shutdown signal.',
  '##[error]A task was canceled.',
].join('\n')

function makeContext(log = cleanCancellationLog): WorkflowRunContext {
  return {
    workflowName: 'Main CI (backend)',
    conclusion: 'failure',
    runAttempt: 1,
    failedJobNames: [backendUnitJobName],
    failedJobLogs: () => Promise.resolve(new Map([[backendUnitJobName, log]])),
    failedJobAnnotations: () => Promise.resolve([]),
  }
}

describe('runner-shutdown-leaf-rerun production registration', () => {
  it('reruns a clean cancellation through the production rule catalogue', async () => {
    await expect(decide(makeContext(), RULES)).resolves.toMatchObject({
      decision: 'rerun',
      matchedRule: 'runner-shutdown-leaf-rerun',
    })
  })

  it('does not let the cancellation marker hide a real test failure', async () => {
    await expect(
      decide(
        makeContext(
          ` FAIL backend/modules/auth/auth.test.mts > login fails\n${cleanCancellationLog}`,
        ),
        RULES,
      ),
    ).resolves.toMatchObject({ decision: 'dispatch', matchedRule: '' })
  })
})
