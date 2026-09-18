import {
  getFailedPlaywrightShardNames,
  hasPlaywrightAssertionFailureSignal,
  isPlaywrightShardSetupJob,
  isStorePlaywrightOtelDownstream,
  storePlaywrightOtelJobName,
} from './playwright-rules.mts'
import { CI_ALWAYS_AGGREGATE_FAN_IN_JOB_NAMES } from './ci-aggregate-jobs.mts'
import type { TransientRetryRule, WorkflowJobStep, WorkflowRunContext } from './types.mts'

function hasMainWebPlaywrightReservedPortCollision(
  log: string,
  jobSteps: WorkflowJobStep[] | undefined,
): boolean {
  const hasPlaywrightRunStarted =
    log.includes('Run Playwright tests') ||
    log.includes('pnpm exec ./ci/with-node-test-options playwright test')
  const hasOtelCollectorPortCollision =
    jobSteps?.some(
      step => step.name === 'Start OTel collector' && step.conclusion === 'failure',
    ) === true &&
    log.includes('Error response from daemon') &&
    /\b(?:port is already allocated|address already in use)\b/i.test(log)
  const hasAllocationPortCollision =
    jobSteps?.some(step => step.name === 'Allocate ports' && step.conclusion === 'failure') ===
      true &&
    (/\bPort \d+ is already in use after allocation; deterministic allocation will not retry/.test(
      log,
    ) ||
      /failed to allocate \d+ ports after \d+ bind attempts from runner slice \d+/.test(log)) &&
    log.includes('##[error]Process completed with exit code 1.')
  const hasPlaywrightWebServerPortCollision =
    /Error: http:\/\/localhost:\d+ is already used, make sure that nothing is running on the port\/url or set reuseExistingServer:true in config\.webServer\./.test(
      log,
    )
  const hasNextServerPortCollision =
    (log.includes('[web] ⨯ Failed to start server') ||
      log.includes('[web] Failed to start server')) &&
    /Error: listen EADDRINUSE: address already in use \S+:\d+/.test(log) &&
    /code:\s*['"]EADDRINUSE['"]/.test(log) &&
    log.includes('Error: Process from config.webServer was not able to start. Exit code: 1')

  const hasPlaywrightPortCollision =
    hasPlaywrightRunStarted &&
    !/\bRunning \d+ tests using \d+ workers\b/.test(log) &&
    (hasPlaywrightWebServerPortCollision || hasNextServerPortCollision)

  return (
    !hasPlaywrightAssertionFailureSignal(log) &&
    (hasAllocationPortCollision ||
      ((hasPlaywrightPortCollision || hasOtelCollectorPortCollision) &&
        /##\[error\]Process completed with exit code (?:1|125)\./.test(log)))
  )
}

const credentialedPlaywrightJobNames = new Map([
  ['CI', 'test-playwright-credentialed / playwright-credentialed-tests'],
  ['Main CI (web)', 'playwright-credentialed-tests / playwright-credentialed-tests'],
])

function hasCompleteCredentialedJobConclusions(ctx: WorkflowRunContext): boolean {
  return (
    ctx.jobNames !== undefined &&
    ctx.jobConclusions !== undefined &&
    ctx.jobNames.every(name => ctx.jobConclusions?.get(name) !== undefined) &&
    ctx.failedJobNames.every(name => ctx.jobNames?.includes(name))
  )
}

function hasStepConclusion(
  jobSteps: WorkflowJobStep[] | undefined,
  name: string,
  conclusion: string,
): boolean {
  return jobSteps?.some(step => step.name === name && step.conclusion === conclusion) === true
}

export const mainWebPlaywrightReservedPortCollisionRule: TransientRetryRule = {
  id: 'main-web-playwright-reserved-port-collision',
  consumerKey: 'playwright-web-server-port-reservation',
  rootCauseKey: 'self-hosted-runner-port-race',
  description:
    'Main CI web Playwright shard finds an allocation-time, app, or OTel collector port already bound before any specs start.',
  rationale:
    'Playwright app and OTel collector ports are chosen from the same deterministic slice. Allocation fails closed when the slice cannot reserve hold sockets (or, historically, when a late lsof preflight saw a collision). After a successful hold, OTel starts immediately and each app port is released immediately before its consumer binds. An allocation, Docker, or app bind failure indicates a stale process or runner-contract drift rather than the former shared-random-port race. One rerun rechecks that slice or lands on a clean runner; a repeat must be investigated.',
  exampleRunIds: ['29498308512', '29987927475'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.workflowName !== 'Main CI (web)' || ctx.conclusion !== 'failure') return false

    const failedPlaywrightShardNames = getFailedPlaywrightShardNames(ctx.failedJobNames)
    if (!failedPlaywrightShardNames) return false
    if (!failedPlaywrightShardNames.every(isPlaywrightShardSetupJob)) return false

    const logs = await ctx.failedJobLogs()
    if (
      ctx.failedJobNames.includes(storePlaywrightOtelJobName) &&
      !isStorePlaywrightOtelDownstream(ctx, true, logs)
    ) {
      return false
    }

    return failedPlaywrightShardNames.every(jobName =>
      hasMainWebPlaywrightReservedPortCollision(
        logs.get(jobName) ?? '',
        ctx.jobSteps?.get(jobName),
      ),
    )
  },
}

const credentialedWebServerNames = ['backend', 'lambdas', 'web', 'cloudflare-worker'] as const

function hasCredentialedWebServerPortCollision(log: string): boolean {
  return credentialedWebServerNames.some(serverName => {
    const forwardedPrefix = serverName === 'cloudflare-worker' ? String.raw`(?:\[wrangler\] )?` : ''
    return (
      new RegExp(
        `\\[${serverName}\\] ${forwardedPrefix}Error: listen EADDRINUSE: address already in use \\S+:\\d+`,
      ).test(log) &&
      new RegExp(`\\[${serverName}\\] ${forwardedPrefix}\\s*code:\\s*['"]EADDRINUSE['"]`).test(log)
    )
  })
}

export const playwrightCredentialedWebServerReservedPortCollisionRule: TransientRetryRule = {
  id: 'playwright-credentialed-web-server-reserved-port-collision',
  consumerKey: 'playwright-credentialed-web-server-port-reservation',
  rootCauseKey: 'self-hosted-runner-port-race',
  description:
    'Credentialed Playwright fails before specs when one of its web servers loses an allocated port.',
  rationale:
    'Credentialed Playwright allocates all four web-server ports before startup. The exact successful allocation plus failed credentialed test step and a named server bind signature identify a late shared-runner bind race; a rerun rechecks the same deterministic slice once, while any other failure needs investigation.',
  exampleRunIds: ['30439023016'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    const credentialedPlaywrightJobName = credentialedPlaywrightJobNames.get(ctx.workflowName)
    const jobConclusions = ctx.jobConclusions
    if (
      credentialedPlaywrightJobName === undefined ||
      (ctx.conclusion !== 'failure' && ctx.conclusion !== 'cancelled') ||
      jobConclusions === undefined ||
      !hasCompleteCredentialedJobConclusions(ctx) ||
      !ctx.failedJobNames.includes(credentialedPlaywrightJobName) ||
      jobConclusions.get(credentialedPlaywrightJobName) !== 'failure' ||
      ctx.failedJobNames.some(
        jobName =>
          jobName !== credentialedPlaywrightJobName &&
          jobConclusions.get(jobName) !== 'cancelled' &&
          !(
            jobConclusions.get(jobName) === 'failure' &&
            CI_ALWAYS_AGGREGATE_FAN_IN_JOB_NAMES.has(jobName)
          ),
      )
    ) {
      return false
    }

    const jobSteps = ctx.jobSteps?.get(credentialedPlaywrightJobName)
    if (
      !hasStepConclusion(jobSteps, 'Allocate ports', 'success') ||
      !hasStepConclusion(jobSteps, 'Run Playwright credentialed tests', 'failure')
    ) {
      return false
    }

    const log =
      (await ctx.jobLogs?.([credentialedPlaywrightJobName]))?.get(credentialedPlaywrightJobName) ??
      ''
    return (
      !hasPlaywrightAssertionFailureSignal(log) &&
      !/\bRunning \d+ tests using \d+ workers?\b/.test(log) &&
      log.includes(
        'pnpm exec ./ci/with-node-test-options playwright test --config playwright.credentialed.config.mts',
      ) &&
      hasCredentialedWebServerPortCollision(log) &&
      log.includes('Error: Process from config.webServer was not able to start. Exit code: 1') &&
      log.includes('##[error]Process completed with exit code 1.')
    )
  },
}
