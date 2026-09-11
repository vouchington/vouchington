import {
  hasSmokeTestFailureSignal,
  hasVitestTestFailureSignal,
} from './runner-shutdown-fingerprints.mts'
import { CI_ALWAYS_AGGREGATE_FAN_IN_JOB_NAMES } from './ci-aggregate-jobs.mts'
import type { TransientRetryRule, WorkflowRunContext } from './types.mts'

export const backendSmokeJobName = 'backend-smoke / smoke'
const githubLogTimestampPrefix =
  /(?:[^\n\t]*\t[^\n\t]*\t)?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s+/g

function hasCompleteKnownJobConclusions(ctx: WorkflowRunContext): boolean {
  return (
    ctx.jobNames !== undefined &&
    ctx.jobConclusions !== undefined &&
    ctx.jobNames.every(name => ctx.jobConclusions?.has(name)) &&
    ctx.failedJobNames.every(name => ctx.jobConclusions?.has(name))
  )
}

function isBackendSmokeOnlyFailure(ctx: WorkflowRunContext): boolean {
  if (!hasCompleteKnownJobConclusions(ctx)) return false
  if (!ctx.failedJobNames.includes(backendSmokeJobName)) return false
  if (ctx.jobConclusions?.get(backendSmokeJobName) !== 'failure') return false

  if (ctx.workflowName === 'Main CI (backend)') {
    return ctx.conclusion === 'failure' && ctx.failedJobNames.length === 1
  }

  if (ctx.workflowName !== 'CI' || !['failure', 'cancelled'].includes(ctx.conclusion)) return false
  return ctx.failedJobNames.every(name => {
    if (name === backendSmokeJobName) return true
    const conclusion = ctx.jobConclusions?.get(name)
    return (
      conclusion === 'cancelled' ||
      (conclusion === 'failure' && CI_ALWAYS_AGGREGATE_FAN_IN_JOB_NAMES.has(name))
    )
  })
}

function hasExactBackendPortAllocationCollision(log: string): boolean {
  const normalized = log.replace(githubLogTimestampPrefix, '')
  const allocationDiagnostic =
    /(?:^|\n)(?:::error::|##\[error\])?Port \d+ is already in use after allocation; deterministic allocation will not retry(?:\n|$)/
  const terminalExit = /(?:^|\n)##\[error\]Process completed with exit code 1\.(?:\n|$)/
  return (
    allocationDiagnostic.test(normalized) &&
    terminalExit.test(normalized) &&
    !hasVitestTestFailureSignal(normalized) &&
    !hasSmokeTestFailureSignal(normalized)
  )
}

function hasExactBackendSmokeServerPortCollision(log: string): boolean {
  const normalized = log.replace(githubLogTimestampPrefix, '')
  const smokeServerFailureWrapper =
    /✗ Error: Server (?:failed during initialization|process died unexpectedly)\. Output:/
  const smokeServerInitializationFailure =
    /(?:^|\n)✗ Error: Server (?:failed during initialization|process died unexpectedly)\. Output:\nError: listen EADDRINUSE: address already in use :::\d+\n(?:[^\n]*\n){0,12}\s*code:\s*['"]EADDRINUSE['"](?:,|\n)/
  const terminalExit = /(?:^|\n)##\[error\]Process completed with exit code 1\.(?:\n|$)/
  const withoutExpectedSmokeFailure = normalized.replace(smokeServerFailureWrapper, '')
  return (
    normalized.includes(
      './scripts/tests/smoke-test-server.sh && ./scripts/tests/smoke-test-worker.sh',
    ) &&
    smokeServerInitializationFailure.test(normalized) &&
    terminalExit.test(normalized) &&
    !hasVitestTestFailureSignal(normalized) &&
    !hasSmokeTestFailureSignal(withoutExpectedSmokeFailure)
  )
}

export const backendSmokeReservedPortCollisionRule: TransientRetryRule = {
  id: 'backend-smoke-reserved-port-collision',
  consumerKey: 'backend-smoke-port-reservation',
  rootCauseKey: 'self-hosted-runner-port-race',
  description:
    'The standalone backend smoke job finds its deterministic backend port bound during allocation or before the smoke server starts.',
  rationale:
    'The standalone smoke job owns the backend port. The allocator selects a deterministic runner slice, but another process can bind after the allocation check and before the smoke server starts. A full workflow rerun rechecks the same slice and recovers CI cancellation fan-out once; incomplete metadata, any other backend failure, or a test failure is not this transient.',
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (!isBackendSmokeOnlyFailure(ctx)) return false
    const jobSteps = ctx.jobSteps?.get(backendSmokeJobName)
    const hasAllocationCollisionStep =
      jobSteps?.some(
        step => step.name === 'Allocate backend port' && step.conclusion === 'failure',
      ) ?? false
    const hasSmokeServerCollisionSteps =
      (jobSteps?.some(
        step => step.name === 'Allocate backend port' && step.conclusion === 'success',
      ) ??
        false) &&
      (jobSteps?.some(
        step => step.name === 'Smoke test backend' && step.conclusion === 'failure',
      ) ??
        false)
    if (!hasAllocationCollisionStep && !hasSmokeServerCollisionSteps) return false

    if (ctx.jobLogs === undefined) return false
    const logs = await ctx.jobLogs([backendSmokeJobName])
    if (!logs.has(backendSmokeJobName)) return false
    if ((await ctx.failedJobLogFetchFailures?.())?.has(backendSmokeJobName)) return false
    const log = logs.get(backendSmokeJobName) ?? ''
    return (
      (hasAllocationCollisionStep && hasExactBackendPortAllocationCollision(log)) ||
      (hasSmokeServerCollisionSteps && hasExactBackendSmokeServerPortCollision(log))
    )
  },
}
