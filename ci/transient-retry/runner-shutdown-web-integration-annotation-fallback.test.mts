import { describe, expect, it } from 'vitest'

import { runnerShutdownLeafRerunMatch } from './runner-shutdown-consumers.mts'
import type { WorkflowRunContext } from './types.mts'

// Production registration and retry accounting are covered through decide()/RULES in
// runner-shutdown-production-rule.test.mts. This direct matcher suite covers the web-integration
// annotation fallback.

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('runnerShutdownLeafRerunMatch — web-integration annotation fallback', () => {
  const webIntegrationJobName = 'test-web-integration / web-integration-tests (1)'
  const runnerLossAnnotation =
    'The self-hosted runner lost communication with the server. Verify the machine is running and has a healthy network connection. Anything in your workflow that terminates the runner process, starves it for CPU/Memory, or blocks its network access can cause this error.'

  it('matches web integration runner communication loss on attempt 1', async () => {
    const ctx = makeCtx({
      failedJobNames: [webIntegrationJobName, 'Patch Coverage', 'tests', 'build'],
      failedJobAnnotations: jobName =>
        Promise.resolve(jobName === webIntegrationJobName ? [runnerLossAnnotation] : []),
    })
    expect(await runnerShutdownLeafRerunMatch(ctx)).toBe(true)
  })

  it('does not match when an unsuccessful log could not be fetched', async () => {
    const jobName = webIntegrationJobName
    const ctx = makeCtx({
      failedJobNames: [jobName, 'Patch Coverage', 'tests', 'build'],
      failedJobLogFetchFailures: () => Promise.resolve(new Set(['Patch Coverage'])),
      failedJobAnnotations: name => Promise.resolve(name === jobName ? [runnerLossAnnotation] : []),
    })

    expect(await runnerShutdownLeafRerunMatch(ctx)).toBe(false)
  })

  it('does not match web integration failures without the runner-loss annotation', async () => {
    const ctx = makeCtx({
      failedJobNames: [webIntegrationJobName, 'Patch Coverage', 'tests', 'build'],
      failedJobAnnotations: jobName =>
        Promise.resolve(
          jobName === webIntegrationJobName ? ['Process completed with exit code 1.'] : [],
        ),
    })
    expect(await runnerShutdownLeafRerunMatch(ctx)).toBe(false)
  })

  it('does not match runner communication loss when the log has a real failure', async () => {
    const jobName = webIntegrationJobName
    const ctx = makeCtx({
      failedJobNames: [jobName, 'Patch Coverage', 'tests', 'build'],
      failedJobLogs: () =>
        Promise.resolve(new Map([[jobName, '##[error]Process completed with exit code 1.']])),
      failedJobAnnotations: name => Promise.resolve(name === jobName ? [runnerLossAnnotation] : []),
    })
    expect(await runnerShutdownLeafRerunMatch(ctx)).toBe(false)
  })

  it('does not match when an additional non-aggregate job fails', async () => {
    const ctx = makeCtx({
      failedJobNames: [
        webIntegrationJobName,
        'test-backend-unit / backend-tests (1)',
        'tests',
        'build',
      ],
      failedJobAnnotations: jobName =>
        Promise.resolve(jobName === webIntegrationJobName ? [runnerLossAnnotation] : []),
    })
    expect(await runnerShutdownLeafRerunMatch(ctx)).toBe(false)
  })

  it('matches the annotation fallback on the generalized rule second attempt', async () => {
    const ctx = makeCtx({
      runAttempt: 2,
      failedJobNames: [webIntegrationJobName, 'tests', 'build'],
      failedJobAnnotations: jobName =>
        Promise.resolve(jobName === webIntegrationJobName ? [runnerLossAnnotation] : []),
    })
    expect(await runnerShutdownLeafRerunMatch(ctx)).toBe(true)
  })
})
