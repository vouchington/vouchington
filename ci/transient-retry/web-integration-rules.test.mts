import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const webIntegrationJobName = 'test-web-integration / web-integration-tests (1)'

const silentBackendStartupExitLog = [
  'Run web integration tests',
  '[web-integration] Preparing data stores...',
  '[web] - Local:         http://127.0.0.1:22705',
  '[lambdas] Lambda dev server: http://localhost:2881',
  '[backend] exited with code 1',
  'No test files found, exiting with code 1',
  'Error: Service backend exited with code 1 before becoming ready at http://127.0.0.1:14217/infra/ping.',
  'Service log: /work/filaments/integration-tests/web/artifacts/service-logs/backend.log',
  'Recent service log:',
  '[backend] exited with code 1',
  '##[error]Process completed with exit code 1.',
].join('\n')

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'Main CI (web)',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [webIntegrationJobName],
  failedJobLogs: () =>
    Promise.resolve(new Map([[webIntegrationJobName, silentBackendStartupExitLog]])),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('main-web-integration-backend-silent-startup-exit', () => {
  it('reruns Main CI web when web-integration backend exits silently before tests run', async () => {
    const result = await decide(makeCtx(), RULES)

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-integration-backend-silent-startup-exit')
  })

  it('reruns when GitHub job log lines include timestamp and job prefixes', async () => {
    const prefixedLog = silentBackendStartupExitLog
      .split('\n')
      .map(
        line =>
          `test-web-integration / web-integration-tests (1)\tUNKNOWN STEP\t2026-07-16T17:00:00.0000000Z ${line}`,
      )
      .join('\n')
    const result = await decide(
      makeCtx({
        failedJobLogs: () => Promise.resolve(new Map([[webIntegrationJobName, prefixedLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-integration-backend-silent-startup-exit')
  })

  it('reruns when the readiness error includes stack frames after the recent service log', async () => {
    const stackFrameLog = silentBackendStartupExitLog.replace(
      'Recent service log:\n[backend] exited with code 1\n##[error]Process completed with exit code 1.',
      [
        'Recent service log:',
        '[backend] exited with code 1',
        '    at serviceExitMessage (integration-tests/web/helpers/processes.mts:155:17)',
        '    at async waitForService (integration-tests/web/helpers/processes.mts:148:5)',
        '##[error]Process completed with exit code 1.',
      ].join('\n'),
    )
    const result = await decide(
      makeCtx({
        failedJobLogs: () => Promise.resolve(new Map([[webIntegrationJobName, stackFrameLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-integration-backend-silent-startup-exit')
  })

  it('does not match outside Main CI web', async () => {
    const result = await decide(makeCtx({ workflowName: 'CI' }), RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when another job failed', async () => {
    const result = await decide(
      makeCtx({ failedJobNames: [webIntegrationJobName, 'test-web / web-tests (1)'] }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match after services become ready', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                webIntegrationJobName,
                `${silentBackendStartupExitLog}\n[web-integration] Services are ready.`,
              ],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match test assertion failures', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                webIntegrationJobName,
                `${silentBackendStartupExitLog}\nFAIL integration-tests/web/tests/worker-routing.mts\nFailed Tests 1`,
              ],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match backend exits that include a real service-log diagnostic', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                webIntegrationJobName,
                silentBackendStartupExitLog.replace(
                  'Recent service log:\n[backend] exited with code 1',
                  'Recent service log:\nError: listen EADDRINUSE: address already in use',
                ),
              ],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when a real service-log diagnostic follows the harness exit line', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                webIntegrationJobName,
                silentBackendStartupExitLog.replace(
                  'Recent service log:\n[backend] exited with code 1',
                  'Recent service log:\n[backend] exited with code 1\nError: listen EADDRINUSE: address already in use',
                ),
              ],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match after the retry cap is exhausted', async () => {
    const result = await decide(makeCtx({ runAttempt: 2 }), RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
