import type { WorkflowRunContext } from './types.mts'

const failedConclusions = new Set(['failure', 'timed_out', 'cancelled'])

export function coverageTransportExhaustedSuites(log: string): string[] {
  return [
    ...log.matchAll(
      /##\[error\]COVERAGE_TRANSPORT_EXHAUSTED suite=([\w-]+) Neither S3 nor GitHub artifacts persisted the coverage pair\./g,
    ),
  ].map(match => match[1])
}

function coverageTransportTailStepNames(suite: string): ReadonlySet<string> {
  return new Set([
    `Upload ${suite} coverage pair to GitHub (fallback attempt 1)`,
    `Upload ${suite} coverage pair to GitHub (fallback attempt 2)`,
    `Require a persisted ${suite} coverage pair`,
  ])
}

export function hasOnlyCoverageTransportTailFailures(
  ctx: WorkflowRunContext,
  jobName: string,
  suites: readonly string[],
): boolean {
  const steps = ctx.jobSteps?.get(jobName)
  if (!steps) return false

  const allowedFailedSteps = new Set(
    suites.flatMap(suite => [...coverageTransportTailStepNames(suite)]),
  )
  if (
    suites.some(
      suite =>
        !steps.some(
          step =>
            step.name === `Require a persisted ${suite} coverage pair` &&
            step.conclusion === 'failure',
        ),
    )
  ) {
    return false
  }

  return steps
    .filter(step => step.conclusion && failedConclusions.has(step.conclusion))
    .every(step => allowedFailedSteps.has(step.name))
}
