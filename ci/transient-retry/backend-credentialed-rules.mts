import {
  hasBackendCredentialedProviderSmokeTestEnvelope,
  hasBackendCredentialedProviderTransientFailure,
} from './backend-credentialed-log-fingerprints.mts'
import {
  hasBackendUnitVitestWorkerUnexpectedExitAfterPassingSummary,
  isBackendUnitShard,
} from './backend-test-rules.mts'
import type { TransientRetryRule } from './types.mts'

const backendProviderTestJobName = 'test-backend-credentialed / backend-credentialed-tests'

import { CI_AGGREGATE_FAN_IN_JOB_NAMES } from './ci-aggregate-jobs.mts'

function hasOnlyBackendCredentialedLeafFailure(failedJobNames: string[]): boolean {
  if (!failedJobNames.includes(backendProviderTestJobName)) return false
  return failedJobNames.every(
    name => name === backendProviderTestJobName || CI_AGGREGATE_FAN_IN_JOB_NAMES.has(name),
  )
}

function isBackendCredentialedWorkflow(workflowName: string): boolean {
  return workflowName === 'CI' || workflowName === 'Main CI (backend)'
}

/**
 * The full transient-classification gate for a credentialed provider smoke-test job: exported so
 * `*.test.mts` siblings exercise the exact composition production uses, instead of re-deriving it.
 */
export function isBackendCredentialedProviderSmokeTestTransient(log: string): boolean {
  if (!hasBackendCredentialedProviderSmokeTestEnvelope(log)) return false

  return hasBackendCredentialedProviderTransientFailure(log)
}

function getSolePairedBackendUnitWorkerExitFailure(
  failedJobNames: string[],
  credentialedLog: string,
  unitLog: string,
): string | null {
  if (!isBackendCredentialedProviderSmokeTestTransient(credentialedLog)) return null

  const leafFailures = failedJobNames.filter(name => !CI_AGGREGATE_FAN_IN_JOB_NAMES.has(name))
  const backendUnitFailures = leafFailures.filter(isBackendUnitShard)
  if (
    !leafFailures.includes(backendProviderTestJobName) ||
    leafFailures.length !== 2 ||
    backendUnitFailures.length !== 1
  )
    return null

  return hasBackendUnitVitestWorkerUnexpectedExitAfterPassingSummary(unitLog)
    ? (backendUnitFailures[0] ?? null)
    : null
}

export const mainBackendCredentialedProviderAndUnitWorkerExitTransientRule: TransientRetryRule = {
  id: 'main-backend-credentialed-provider-and-unit-worker-exit',
  consumerKey: 'main-backend-credentialed-provider-and-unit-vitest',
  rootCauseKey: 'external-provider-transient-plus-worker-exit-after-pass',
  description:
    'Main backend CI fails in the credentialed provider smoke tests and a backend unit shard that completed all tests before a Vitest worker exited unexpectedly.',
  rationale:
    'Both failed leaves are independently retryable: the credentialed job hit a provider-side transient, and the unit shard reported all files/tests passed before Vitest emitted only worker-pool exit errors. A full run rerun is required because two separate jobs failed.',
  exampleRunIds: ['30156142228'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.workflowName !== 'Main CI (backend)' || ctx.conclusion !== 'failure') return false
    if (!ctx.failedJobNames.includes(backendProviderTestJobName)) return false

    const logs = await ctx.failedJobLogs()
    const credentialedLog = logs.get(backendProviderTestJobName) ?? ''
    const backendUnitJobName = ctx.failedJobNames.find(isBackendUnitShard)
    if (!backendUnitJobName) return false

    return (
      getSolePairedBackendUnitWorkerExitFailure(
        ctx.failedJobNames,
        credentialedLog,
        logs.get(backendUnitJobName) ?? '',
      ) !== null
    )
  },
}

export const backendCredentialedProviderSmokeTestTransientRule: TransientRetryRule = {
  id: 'backend-credentialed-provider-smoke-test-transient',
  consumerKey: 'backend-credentialed-provider-smoke-tests',
  rootCauseKey: 'external-provider-transient',
  description:
    'Backend credentialed job fails only in a probe owned by a credentialed Vitest project (backend-aws, backend-bedrock, backend-openai, backend-openrouter, backend-stripe) and the failure carries a known provider-transport marker (timeout, an AWS-SDK request abort/timeout, a Bedrock 500, an OpenAI 429/500, or an OpenRouter 429/5xx).',
  rationale:
    "The failure is a timeout, an AWS-SDK request abort/timeout, or a provider-side 500/429 constrained to known failure blocks, not a local assertion; coverage, tests, and build fail only because the credentialed producer exits early. Any test file added under a credentialed project's own `include` glob is covered automatically, so new probes cannot ship silently uncovered.",
  exampleRunIds: [
    '29965903981',
    '29354792259',
    '29043236211',
    '28820239952',
    '28731728115',
    '28701569552',
    '28440881163',
    '27051861422',
    '26802868128',
  ],
  maxAttempts: 2,
  needsLogs: true,
  match: async ctx => {
    if (!isBackendCredentialedWorkflow(ctx.workflowName) || ctx.conclusion !== 'failure')
      return false
    if (!hasOnlyBackendCredentialedLeafFailure(ctx.failedJobNames)) return false

    const logs = await ctx.failedJobLogs()
    const log = logs.get(backendProviderTestJobName) ?? ''
    return isBackendCredentialedProviderSmokeTestTransient(log)
  },
}
