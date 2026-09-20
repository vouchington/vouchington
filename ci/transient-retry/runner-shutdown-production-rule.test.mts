import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const backendUnitJobName = 'test-backend-unit / backend-tests (1)'
const cleanCancellationLog = [
  'pnpm exec ./ci/with-node-test-options vitest run --project backend-data-stores',
  '##[error]The runner has received a shutdown signal.',
  '##[error]A task was canceled.',
].join('\n')

function makeContext(
  log = cleanCancellationLog,
  overrides: Partial<WorkflowRunContext> = {},
): WorkflowRunContext {
  return {
    workflowName: 'Main CI (backend)',
    conclusion: 'failure',
    runAttempt: 1,
    failedJobNames: [backendUnitJobName],
    failedJobLogs: () => Promise.resolve(new Map([[backendUnitJobName, log]])),
    failedJobAnnotations: () => Promise.resolve([]),
    ...overrides,
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

  it('reruns a clean backend-smoke shutdown', async () => {
    await expect(
      decide(
        makeContext(cleanCancellationLog, {
          failedJobNames: ['backend-smoke / smoke'],
          failedJobLogs: () =>
            Promise.resolve(new Map([['backend-smoke / smoke', cleanCancellationLog]])),
        }),
        RULES,
      ),
    ).resolves.toMatchObject({ decision: 'rerun', matchedRule: 'runner-shutdown-leaf-rerun' })
  })

  it('reruns a clean tooling shutdown', async () => {
    const toolingJobName = 'tooling-tests / tooling'
    const toolingShutdownLog = [
      'node ci/tooling-test-runner.mts --bail=3',
      '##[error]The runner has received a shutdown signal.',
      '##[error]The operation was canceled.',
    ].join('\n')
    await expect(
      decide(
        makeContext(toolingShutdownLog, {
          workflowName: 'Main CI (checks)',
          failedJobNames: [toolingJobName],
          failedJobLogs: () => Promise.resolve(new Map([[toolingJobName, toolingShutdownLog]])),
        }),
        RULES,
      ),
    ).resolves.toMatchObject({ decision: 'rerun', matchedRule: 'runner-shutdown-leaf-rerun' })
  })

  it('uses the two-attempt cap and preserves a later first occurrence', async () => {
    await expect(
      decide(
        makeContext(cleanCancellationLog, {
          runAttempt: 3,
        }),
        RULES,
      ),
    ).resolves.toMatchObject({ decision: 'dispatch', matchedRule: '' })

    await expect(
      decide(
        makeContext(cleanCancellationLog, {
          runAttempt: 4,
          ruleAttempts: new Map([['runner-shutdown-leaf-rerun', 1]]),
        }),
        RULES,
      ),
    ).resolves.toMatchObject({ decision: 'rerun', matchedRule: 'runner-shutdown-leaf-rerun' })
  })
})
