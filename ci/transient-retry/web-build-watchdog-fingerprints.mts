import {
  hasExpensiveBuildCommandTimeout,
  hasExplicitOomEvidence,
  hasNextBuildFailureSignal,
} from './runner-shutdown-fingerprints.mts'
import { stripAnsi } from './storybook-shared.mts'
import {
  hasEmittedExpensiveBuildCommandTimeout,
  hasExpensiveBuildProcessGroupSurvivedSigkill,
} from './host-lock-fingerprints.mts'

export const buildWebTargetsStepMarker = '##[group]Run ./.github/actions/build-web-targets'
const hasNoBuildFailure = (log: string) =>
  !hasNextBuildFailureSignal(log) && !hasExplicitOomEvidence(log)

export function hasBuildWebTargetsWatchdogTimeout(log: string): boolean {
  const plainLog = stripAnsi(log)
  return (
    plainLog.includes(buildWebTargetsStepMarker) &&
    plainLog.includes('Creating an optimized production build ...') &&
    hasExpensiveBuildCommandTimeout(plainLog) &&
    (plainLog.includes('Error: pnpm --dir web build failed with exit code 124') ||
      (hasEmittedExpensiveBuildCommandTimeout(plainLog) &&
        hasExpensiveBuildProcessGroupSurvivedSigkill(plainLog) &&
        plainLog.includes('Error: pnpm --dir web build failed with exit code 1'))) &&
    plainLog.includes('##[error]Process completed with exit code 1.') &&
    hasNoBuildFailure(plainLog)
  )
}
