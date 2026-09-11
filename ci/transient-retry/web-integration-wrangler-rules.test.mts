import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const webIntegrationJobName = 'test-web-integration / web-integration-tests (1)'

const wranglerSocketClosedLog = [
  'Run web integration tests',
  '[web-integration] Preparing data stores...',
  '[web-integration] Services are ready.',
  'Uncaught Error: Network connection lost',
  ' FAIL  integration-tests/web/tests/seeded-topic-page.mts',
  '[TypeError: fetch failed] {',
  '  [cause]: SocketError: other side closed',
  "    code: 'UND_ERR_SOCKET'",
  '  }',
  '}',
  ' FAIL  integration-tests/web/tests/worker-login.mts',
  ' FAIL  integration-tests/web/tests/identity-redirect.mts',
  ' Test Files  3 failed | 386 passed',
  '##[error]Process completed with exit code 1.',
].join('\n')

// Built from a real capture: #10819 fault injection killed start.mts's whole process group
// mid-suite (WRANGLER_STABLE_UPTIME_MS=2000, no restart survives a dead supervisor), so the worker
// port stayed closed for the rest of the run. See cloudflare-worker/scripts/wrangler/start.mts and
// integration-tests/web/helpers/exit-diagnostics.mts.
const wranglerExhaustionLog = [
  'Run web integration tests',
  '[web-integration] Preparing data stores...',
  '[web-integration] Services are ready.',
  '[processes] managed process worker exited unexpectedly after ready: signal SIGKILL',
  '[fetch-retry] /communities: attempt 1 failed (UND_ERR_SOCKET), retrying in 250ms',
  '[fetch-retry] /communities: attempt 2 failed (ECONNREFUSED), retrying in 500ms',
  '[fetch-retry] /communities: attempt 5 failed (ECONNREFUSED), retrying in 2000ms',
  ' FAIL  integration-tests/web/tests/__tests__/web.test.mts',
  'TypeError: fetch failed',
  'Caused by: Error: connect ECONNREFUSED 127.0.0.1:52846',
  "Serialized Error: { errno: -61, code: 'ECONNREFUSED', syscall: 'connect', address: '127.0.0.1', port: 52846 }",
  ' Test Files  1 failed | 3 passed (4)',
  '##[error]Process completed with exit code 1.',
].join('\n')

const routeBaselineAssertionLog = [
  'Run web integration tests',
  '[web-integration] Services are ready.',
  ' FAIL  integration-tests/web/tests/worker-routing.mts',
  'AssertionError: expected 500 to be 404',
  ' Failed Tests 1',
  '##[error]Process completed with exit code 1.',
].join('\n')

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [webIntegrationJobName, 'Patch Coverage', 'tests', 'build'],
  failedJobLogs: () => Promise.resolve(new Map([[webIntegrationJobName, wranglerSocketClosedLog]])),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('web-integration-wrangler-socket-closed', () => {
  it('reruns CI when wrangler drops the local socket and tests fail UND_ERR_SOCKET', async () => {
    const result = await decide(makeCtx(), RULES)

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('web-integration-wrangler-socket-closed')
  })

  it('reruns when GitHub job log lines include timestamp and job prefixes', async () => {
    const prefixedLog = wranglerSocketClosedLog
      .split('\n')
      .map(
        line =>
          `test-web-integration / web-integration-tests (1)\tUNKNOWN STEP\t2026-08-21T23:40:20.0000000Z ${line}`,
      )
      .join('\n')
    const result = await decide(
      makeCtx({
        failedJobLogs: () => Promise.resolve(new Map([[webIntegrationJobName, prefixedLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('web-integration-wrangler-socket-closed')
  })

  it('does not match Main CI web', async () => {
    const result = await decide(makeCtx({ workflowName: 'Main CI (web)' }), RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when another leaf job failed', async () => {
    const result = await decide(
      makeCtx({ failedJobNames: [webIntegrationJobName, 'test-web / web-tests (1)'] }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when another integration shard has no matching fingerprint', async () => {
    const otherShard = 'test-web-integration / web-integration-tests (2)'
    const result = await decide(
      makeCtx({
        failedJobNames: [webIntegrationJobName, otherShard],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [webIntegrationJobName, wranglerSocketClosedLog],
              [otherShard, routeBaselineAssertionLog],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match a route-baseline assertion 500 versus 404', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(new Map([[webIntegrationJobName, routeBaselineAssertionLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match wrangler crash without UND_ERR_SOCKET', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                webIntegrationJobName,
                wranglerSocketClosedLog.replace("code: 'UND_ERR_SOCKET'", "code: 'UND_ERR_OTHER'"),
              ],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match UND_ERR_SOCKET without wrangler Network connection lost', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                webIntegrationJobName,
                wranglerSocketClosedLog.replace(
                  'Uncaught Error: Network connection lost',
                  'worker still running',
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

  it('reruns CI when the restart budget exhausts and tests fail ECONNREFUSED', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(new Map([[webIntegrationJobName, wranglerExhaustionLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('web-integration-wrangler-socket-closed')
  })

  it('does not match the post-ready exit marker without an undici ECONNREFUSED fingerprint', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                webIntegrationJobName,
                wranglerExhaustionLog.replace(
                  "Serialized Error: { errno: -61, code: 'ECONNREFUSED', syscall: 'connect', address: '127.0.0.1', port: 52846 }",
                  "Serialized Error: { errno: -61, code: 'ECONNRESET', syscall: 'read' }",
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

  it('does not match an undici ECONNREFUSED fingerprint without the post-ready exit marker', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                webIntegrationJobName,
                wranglerExhaustionLog.replace(
                  '[processes] managed process worker exited unexpectedly after ready: signal SIGKILL',
                  'worker still running',
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
})
