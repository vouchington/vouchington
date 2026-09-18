import { CI_AGGREGATE_FAN_IN_JOB_NAMES, isAggregateFanInCascade } from './ci-aggregate-jobs.mts'
import { sliceGithubActionsStepGroup } from './github-actions-log.mts'
import { hasNoPlaywrightOtelArtifacts } from './playwright-rules.mts'
import type { TransientRetryRule, WorkflowRunContext } from './types.mts'

const playwrightSelectJobName = 'playwright-tests / select'
const storePlaywrightOtelJobName = 'store-playwright-otel'

function hasPlaywrightSelectCleanWorkspaceFetchTimeout(log: string): boolean {
  if (!log.includes('Run ./.github/actions/clean-workspace')) return false

  return (
    (log.includes('##[error]The action has timed out.') && log.includes('git-remote-https')) ||
    (log.includes('git fetch --no-tags') &&
      log.includes('timed out on attempt') &&
      log.includes('failed after 3 attempts'))
  )
}

function hasOnlyPlaywrightSelectFetchTimeoutFailures(
  ctx: WorkflowRunContext,
  logs: Map<string, string>,
): boolean {
  for (const jobName of ctx.failedJobNames) {
    if (jobName === playwrightSelectJobName) continue
    if (jobName !== storePlaywrightOtelJobName) return false
    if (!hasNoPlaywrightOtelArtifacts(logs.get(jobName) ?? '')) return false
  }
  return true
}

// clean-workspace's composite action step echoes its own `run:` command as the group header. PR
// #10519 changed that command from a direct "$GITHUB_ACTION_PATH/clean-workspace.sh" invocation to
// delegating through ci/exec-vouchington-gha.sh. Freshness against action.yml is enforced by
// step-group-marker-freshness.test.mts, not by this comment.
export const cleanWorkspaceScriptStepMarker =
  '##[group]Run bash ci/exec-vouchington-gha.sh clean-workspace scripts/gha/clean-workspace.sh'

function hasCleanWorkspaceVouchingtonToolingDownloadFlake(log: string): boolean {
  const stepLog = sliceGithubActionsStepGroup(log, cleanWorkspaceScriptStepMarker)
  if (stepLog === '') return false

  // A checksum integrity failure is a supply-chain signal, never a transport flake — exclude it
  // structurally rather than relying on the positive predicates below to happen to miss it.
  if (stepLog.includes('failed integrity check')) return false

  return (
    stepLog.includes('ci/exec-vouchington-gha.sh: failed to download vouchington-tooling@') &&
    stepLog.includes('DOWNLOAD FAILED: https://registry.npmjs.org/vouchington-tooling/') &&
    (stepLog.includes('curl: (28)') ||
      stepLog.includes('curl: (56)') ||
      stepLog.includes('curl: (6)') ||
      stepLog.includes('curl: (7)') ||
      stepLog.includes('curl: (35)') ||
      // HTTP 000 is excluded here: ci_download_to (ci/curl-to.sh) prints "HTTP 000" whenever
      // curl fails before receiving a response — including deterministic failures such as a
      // disk-full write error or an out-of-memory kill — not only the transient exit codes
      // already enumerated above. A bare "000" would silently defeat that enumeration.
      /→ HTTP 5\d\d/.test(stepLog)) &&
    stepLog.includes('##[error]Process completed with exit code 1.')
  )
}

export const cleanWorkspaceVouchingtonToolingDownloadFlakeRule: TransientRetryRule = {
  id: 'clean-workspace-vouchington-tooling-download-flake',
  consumerKey: 'clean-workspace-vouchington-tooling-download',
  rootCauseKey: 'npm-registry-transport-failure',
  description:
    'clean-workspace fails before any job-specific step runs because its pre-trust-gate curl fallback cannot download vouchington-tooling from the npm registry.',
  rationale:
    'clean-workspace intentionally bypasses the packaged and pnpm-dlx fast paths before the trust gate and downloads vouchington-tooling directly from registry.npmjs.org with a checksum verification against pnpm-lock.yaml; a transport failure or timeout against that registry fails every job using the action before any job-specific logic runs, and the checksum check still guards a retried download, so rerunning once is safe.',
  exampleRunIds: ['33277864198', '33464822312'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.conclusion !== 'failure') return false
    if (ctx.failedJobNames.length === 0) return false

    const logs = await ctx.failedJobLogs()
    // Fan-in jobs (tests, build, ...) fail whenever any leaf job fails, so a fan-in job whose own
    // log is just the cascade summary must not be required to carry the leaf-specific signature
    // itself — only jobs that failed for their own reason need to show the flake. A cancelled
    // sibling job carries no failure signature of its own either — GitHub cancels it because
    // another job in the run failed, not independently — and usually has no matching log entry
    // at all, so it must be excluded from the "every failed job shows the flake" check too.
    const leaves = ctx.failedJobNames.filter(
      name =>
        ctx.jobConclusions?.get(name) !== 'cancelled' &&
        (!CI_AGGREGATE_FAN_IN_JOB_NAMES.has(name) ||
          !isAggregateFanInCascade(name, logs.get(name) ?? '')),
    )
    if (leaves.length === 0) return false
    return leaves.every(name =>
      hasCleanWorkspaceVouchingtonToolingDownloadFlake(logs.get(name) ?? ''),
    )
  },
}

export const playwrightSelectCleanWorkspaceFetchTimeoutRule: TransientRetryRule = {
  id: 'playwright-select-clean-workspace-fetch-timeout',
  consumerKey: 'playwright-selector-clean-workspace',
  rootCauseKey: 'github-fetch-timeout',
  description:
    'Main CI web Playwright selector fails transiently while clean-workspace prepares the test-selection checkout.',
  rationale:
    'The Playwright selector fails before dependency setup or test selection because a self-hosted runner git fetch hangs until timeout, or because the runner receives a shutdown signal during the clean-workspace step. Downstream OTel storage can fail only because no Playwright shard artifacts exist, and web test companion failures are accepted only with GitHub runner-lost-communication annotations.',
  exampleRunIds: ['27474807081', '28696967474'],
  maxAttempts: 2,
  needsLogs: true,
  match: async ctx => {
    if (ctx.workflowName !== 'Main CI (web)' || ctx.conclusion !== 'failure') return false
    if (!ctx.failedJobNames.includes(playwrightSelectJobName)) return false

    const logs = await ctx.failedJobLogs()
    const selectorLog = logs.get(playwrightSelectJobName) ?? ''
    return (
      hasPlaywrightSelectCleanWorkspaceFetchTimeout(selectorLog) &&
      hasOnlyPlaywrightSelectFetchTimeoutFailures(ctx, logs)
    )
  },
}
