import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const gitleaksJobName = 'gitleaks'

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'Gitleaks',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [gitleaksJobName],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

function decideForGitleaksLog(
  log: string,
  overrides: Partial<WorkflowRunContext> = {},
): Promise<Awaited<ReturnType<typeof decide>>> {
  return decide(
    makeCtx({
      failedJobLogs: () => Promise.resolve(new Map([[gitleaksJobName, log]])),
      ...overrides,
    }),
    RULES,
  )
}

// Observed verbatim on run 33464822312, job 99722578164 ("test-backend-credentialed /
// backend-credentialed-tests", 2026-09-01) — the run that led to this file's marker update.
// PR #10519 (2026-08-30) changed clean-workspace's composite action `run:` step from a direct
// "$GITHUB_ACTION_PATH/clean-workspace.sh" invocation to delegating through
// ci/exec-vouchington-gha.sh, which also dropped the absolute path prefix that `fail()` used to
// print (the script now runs as the relative path GitHub Actions was given). The original
// signature was first observed on run 33277864198, job 99167679767 ("gitleaks", 2026-08-29), the
// run that led to issue #10416. clean-workspace force-bypasses the packaged/pnpm-dlx fast paths
// pre-trust-gate and downloads vouchington-tooling directly from the npm registry; the download
// transport failed before the job's own install step ever ran.
const vouchingtonToolingSslTimeoutLog = [
  'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:19.1779939Z ##[group]Run bash ci/exec-vouchington-gha.sh clean-workspace scripts/gha/clean-workspace.sh',
  'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:19.1792771Z env:',
  'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:19.1797048Z ##[endgroup]',
  'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:49.2194218Z curl: (28) SSL connection timeout',
  'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:49.2220863Z ci/exec-vouchington-gha.sh: failed to download vouchington-tooling@0.4.1',
  'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:49.2222120Z DOWNLOAD FAILED: https://registry.npmjs.org/vouchington-tooling/-/vouchington-tooling-0.4.1.tgz → HTTP 000',
  'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:49.2240071Z ##[error]Process completed with exit code 1.',
].join('\n')

function vouchingtonToolingLog(curlLine: string, downloadFailedSuffix = '→ HTTP 000'): string {
  return [
    'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:19.1779939Z ##[group]Run bash ci/exec-vouchington-gha.sh clean-workspace scripts/gha/clean-workspace.sh',
    'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:19.1797048Z ##[endgroup]',
    `gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:49.2194218Z ${curlLine}`,
    'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:49.2220863Z ci/exec-vouchington-gha.sh: failed to download vouchington-tooling@0.4.1',
    `gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:49.2222120Z DOWNLOAD FAILED: https://registry.npmjs.org/vouchington-tooling/-/vouchington-tooling-0.4.1.tgz ${downloadFailedSuffix}`,
    'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:49.2240071Z ##[error]Process completed with exit code 1.',
  ].join('\n')
}

const vouchingtonToolingChecksumMismatchLog = [
  'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:19.1779939Z ##[group]Run bash ci/exec-vouchington-gha.sh clean-workspace scripts/gha/clean-workspace.sh',
  'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:19.1797048Z ##[endgroup]',
  'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:49.2220863Z ci/exec-vouchington-gha.sh: downloaded vouchington-tooling tarball failed integrity check',
  'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:49.2240071Z ##[error]Process completed with exit code 1.',
].join('\n')

// Hypothetical: every transport-flake marker plus the integrity-check marker in the same step
// group. exec-vouchington-gha.sh's `fail()` exits immediately on the first failure, so this
// combination cannot occur from the script as written today — but the classifier must not rely on
// that incidentally; the integrity marker is a supply-chain signal that must exclude a match even
// when every transport predicate is otherwise satisfied.
const vouchingtonToolingMixedTransportAndIntegrityLog = [
  'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:19.1779939Z ##[group]Run bash ci/exec-vouchington-gha.sh clean-workspace scripts/gha/clean-workspace.sh',
  'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:19.1797048Z ##[endgroup]',
  'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:49.2194218Z curl: (28) SSL connection timeout',
  'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:49.2220863Z ci/exec-vouchington-gha.sh: failed to download vouchington-tooling@0.4.1',
  'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:49.2222120Z DOWNLOAD FAILED: https://registry.npmjs.org/vouchington-tooling/-/vouchington-tooling-0.4.1.tgz → HTTP 000',
  'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:49.2222200Z ci/exec-vouchington-gha.sh: downloaded vouchington-tooling tarball failed integrity check',
  'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:49.2240071Z ##[error]Process completed with exit code 1.',
].join('\n')

const buildCascadeLog = [
  'build\tRun tests\t2026-09-01T03:05:19.1779939Z ##[group]Run pnpm run build',
  'build\tRun tests\t2026-09-01T03:05:49.2220863Z One or more build jobs failed or were cancelled',
  'build\tRun tests\t2026-09-01T03:05:49.2240071Z ##[error]Process completed with exit code 1.',
].join('\n')

const cleanWorkspaceUnrelatedFailureLog = [
  'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:19.1779939Z ##[group]Run bash ci/exec-vouchington-gha.sh clean-workspace scripts/gha/clean-workspace.sh',
  'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:19.1797048Z ##[endgroup]',
  'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:49.2220863Z rm: cannot remove .git/index.lock: Permission denied',
  'gitleaks\tReset, selective clean, refresh git state\t2026-09-01T03:05:49.2240071Z ##[error]Process completed with exit code 1.',
].join('\n')

function expectRerun(result: Awaited<ReturnType<typeof decide>>): void {
  expect(`${result.decision}:${result.matchedRule}`).toBe(
    'rerun:clean-workspace-vouchington-tooling-download-flake',
  )
}
function expectDispatch(result: Awaited<ReturnType<typeof decide>>): void {
  expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
}

describe('clean-workspace-vouchington-tooling-download-flake', () => {
  it('reruns the real observed run 33464822312 SSL connection timeout', async () => {
    expectRerun(await decideForGitleaksLog(vouchingtonToolingSslTimeoutLog))
  })

  it('reruns a connection-reset transport failure (curl exit 56)', async () => {
    expectRerun(
      await decideForGitleaksLog(
        vouchingtonToolingLog('curl: (56) Recv failure: Connection reset by peer'),
      ),
    )
  })

  it('reruns an npm registry HTTP 502 without a distinguishing curl exit code', async () => {
    expectRerun(
      await decideForGitleaksLog(
        vouchingtonToolingLog('curl: (22) The requested URL returned error: 502', '→ HTTP 502'),
      ),
    )
  })

  it('reruns when every failed job across the workflow hit the same clean-workspace flake', async () => {
    const buildJobName = 'build'
    const result = await decide(
      makeCtx({
        workflowName: 'CI',
        failedJobNames: [gitleaksJobName, buildJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [gitleaksJobName, vouchingtonToolingSslTimeoutLog],
              [buildJobName, vouchingtonToolingSslTimeoutLog],
            ]),
          ),
      }),
      RULES,
    )
    expectRerun(result)
  })

  it('reruns when a fan-in job failure is only the validated cascade summary', async () => {
    const buildJobName = 'build'
    const result = await decide(
      makeCtx({
        workflowName: 'CI',
        failedJobNames: [gitleaksJobName, buildJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [gitleaksJobName, vouchingtonToolingSslTimeoutLog],
              [buildJobName, buildCascadeLog],
            ]),
          ),
      }),
      RULES,
    )
    expectRerun(result)
  })

  it('reruns when a cancelled sibling job has no matching log', async () => {
    const cancelledJobName = 'static-analysis'
    const result = await decide(
      makeCtx({
        workflowName: 'CI',
        failedJobNames: [gitleaksJobName, cancelledJobName],
        jobConclusions: new Map([
          [gitleaksJobName, 'failure'],
          [cancelledJobName, 'cancelled'],
        ]),
        failedJobLogs: () =>
          Promise.resolve(new Map([[gitleaksJobName, vouchingtonToolingSslTimeoutLog]])),
      }),
      RULES,
    )
    expectRerun(result)
  })

  it('does not match an HTTP 000 download failure without a recognized transient curl exit', async () => {
    expectDispatch(
      await decideForGitleaksLog(
        vouchingtonToolingLog('curl: (23) Failed writing received data to disk/application'),
      ),
    )
  })

  it('does not match when only one of several failed jobs hit the flake', async () => {
    const buildJobName = 'build'
    const result = await decide(
      makeCtx({
        workflowName: 'CI',
        failedJobNames: [gitleaksJobName, buildJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [gitleaksJobName, vouchingtonToolingSslTimeoutLog],
              [
                buildJobName,
                'Error: TS2322 Type mismatch\n##[error]Process completed with exit code 2.',
              ],
            ]),
          ),
      }),
      RULES,
    )
    expectDispatch(result)
  })

  it('does not match a downloaded-tarball checksum integrity failure', async () => {
    expectDispatch(await decideForGitleaksLog(vouchingtonToolingChecksumMismatchLog))
  })

  it('does not match when a transport failure is followed by an integrity-check failure', async () => {
    expectDispatch(await decideForGitleaksLog(vouchingtonToolingMixedTransportAndIntegrityLog))
  })

  it('does not match an unrelated clean-workspace failure', async () => {
    expectDispatch(await decideForGitleaksLog(cleanWorkspaceUnrelatedFailureLog))
  })

  it('does not match a look-alike download failure outside the clean-workspace.sh step', async () => {
    const laterStepLog = [
      'gitleaks\tSome later step\t2026-08-29T22:10:26.3078035Z ##[group]Run pnpm install',
      'gitleaks\tSome later step\t2026-08-29T22:10:56.3505936Z ci/exec-vouchington-gha.sh: failed to download vouchington-tooling@0.2.0',
      'gitleaks\tSome later step\t2026-08-29T22:10:56.3504670Z DOWNLOAD FAILED: https://registry.npmjs.org/vouchington-tooling/-/vouchington-tooling-0.2.0.tgz → HTTP 000',
      'gitleaks\tSome later step\t2026-08-29T22:10:56.3485011Z curl: (28) SSL connection timeout',
      'gitleaks\tSome later step\t2026-08-29T22:10:57.2964860Z ##[error]Process completed with exit code 1.',
    ].join('\n')
    expectDispatch(await decideForGitleaksLog(laterStepLog))
  })

  it('does not match after the retry cap is exhausted', async () => {
    expectDispatch(await decideForGitleaksLog(vouchingtonToolingSslTimeoutLog, { runAttempt: 2 }))
  })

  it('does not match when every failed job is only a validated fan-in cascade', async () => {
    const buildJobName = 'build'
    const result = await decide(
      makeCtx({
        workflowName: 'CI',
        failedJobNames: [buildJobName],
        failedJobLogs: () => Promise.resolve(new Map([[buildJobName, buildCascadeLog]])),
      }),
      RULES,
    )
    expectDispatch(result)
  })
})
