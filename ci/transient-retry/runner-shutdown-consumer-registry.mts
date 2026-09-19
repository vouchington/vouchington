import { isPlaywrightSetupJob } from './playwright-rules.mts'
import {
  hasBackendCredentialedVitestFailure,
  hasBackendCredentialedVitestStarted,
  hasBackendUnitVitestFailure,
  hasGenericFailureSignal,
  hasMigrationFailureSignal,
  hasNextBuildFailureSignal,
  hasPlaywrightFailureSignal,
  hasRunnerShutdownMarkers,
  hasSmokeTestFailureSignal,
  hasStorybookVitestStarted,
  hasToolingVitestStarted,
  hasVitestTestFailureSignal,
  hasWebStackBuildFailureSignal,
} from './runner-shutdown-fingerprints.mts'
import { storybookJobName } from './storybook-shared.mts'

// Marks the start of the shared build-web-targets composite action's log region. Not host-lock- or
// runner-shutdown-specific; several consumers below and web-build-rules.mts key off it to find
// where a Next.js build's log output begins.
export const buildWebTargetsStepMarker = '##[group]Run ./.github/actions/build-web-targets'

export const backendUnitShardPattern = /^test-backend-unit \/ backend-tests \(\d+\)$/
export const backendSmokeJobName = 'backend-smoke / smoke'
export const backendCredentialedJobName = 'test-backend-credentialed / backend-credentialed-tests'
export const mainChecksToolingJobName = 'tooling-tests / tooling'
export const staticWebJobName = 'static-checks / static-web'
export const webTestsShardPattern = /^test-web \/ web-tests \(\d+\)$/
export const webApiShardPattern = /^test-web-api \/ web-api-tests \([1-9]\d*\)$/
export const webIntegrationShardPattern = /^test-web-integration \/ web-integration-tests \(\d+\)$/

export function isWebApiShardJob(jobName: string | undefined): boolean {
  return typeof jobName === 'string' && webApiShardPattern.test(jobName)
}

export function isWebIntegrationShardJob(jobName: string | undefined): boolean {
  return typeof jobName === 'string' && webIntegrationShardPattern.test(jobName)
}
export const playwrightSelectJobName = 'playwright-tests / select'

interface ConsumerEntry {
  matches: (jobName: string) => boolean
  isConsumerFailure: (log: string) => boolean
}

function hasPlaywrightSelectorFailure(log: string): boolean {
  const cleanWorkspaceStart = log.indexOf('##[group]Run ./.github/actions/clean-workspace')
  if (cleanWorkspaceStart === -1) return true
  const nextStep = log.indexOf('##[group]Run ', cleanWorkspaceStart + 1)
  const cleanWorkspaceLog = log.slice(cleanWorkspaceStart, nextStep === -1 ? undefined : nextStep)
  return !hasRunnerShutdownMarkers(cleanWorkspaceLog) || hasGenericFailureSignal(cleanWorkspaceLog)
}

const consumers: ConsumerEntry[] = [
  {
    matches: name => backendUnitShardPattern.test(name),
    isConsumerFailure: hasBackendUnitVitestFailure,
  },
  {
    matches: name => name === backendSmokeJobName,
    isConsumerFailure: log => hasMigrationFailureSignal(log) || hasSmokeTestFailureSignal(log),
  },
  {
    matches: name => name === playwrightSelectJobName,
    isConsumerFailure: hasPlaywrightSelectorFailure,
  },
  {
    matches: name => name === backendCredentialedJobName,
    isConsumerFailure: log =>
      !hasBackendCredentialedVitestStarted(log) || hasBackendCredentialedVitestFailure(log),
  },
  {
    matches: name => name === mainChecksToolingJobName,
    isConsumerFailure: log => !hasToolingVitestStarted(log) || hasVitestTestFailureSignal(log),
  },
  {
    matches: name => name === storybookJobName,
    isConsumerFailure: log => !hasStorybookVitestStarted(log) || hasVitestTestFailureSignal(log),
  },
  {
    matches: name => name === staticWebJobName,
    isConsumerFailure: log =>
      !log.includes(buildWebTargetsStepMarker) ||
      hasWebStackBuildFailureSignal(log) ||
      hasSmokeTestFailureSignal(log),
  },
  {
    matches: name => webTestsShardPattern.test(name),
    isConsumerFailure: log =>
      hasVitestTestFailureSignal(log) ||
      hasNextBuildFailureSignal(log) ||
      hasSmokeTestFailureSignal(log),
  },
  {
    matches: isWebApiShardJob,
    isConsumerFailure: log => hasVitestTestFailureSignal(log) || hasMigrationFailureSignal(log),
  },
  {
    matches: isWebIntegrationShardJob,
    isConsumerFailure: log =>
      hasVitestTestFailureSignal(log) ||
      hasPlaywrightFailureSignal(log) ||
      hasWebStackBuildFailureSignal(log) ||
      hasMigrationFailureSignal(log),
  },
  {
    matches: isPlaywrightSetupJob,
    isConsumerFailure: log =>
      hasPlaywrightFailureSignal(log) ||
      hasWebStackBuildFailureSignal(log) ||
      hasMigrationFailureSignal(log),
  },
]

export function findRunnerShutdownConsumer(jobName: string): ConsumerEntry | undefined {
  return consumers.find(consumer => consumer.matches(jobName))
}

export function isCoverageProducerJob(jobName: string): boolean {
  return (
    backendUnitShardPattern.test(jobName) ||
    jobName === backendCredentialedJobName ||
    jobName === mainChecksToolingJobName ||
    webTestsShardPattern.test(jobName) ||
    isWebApiShardJob(jobName) ||
    isWebIntegrationShardJob(jobName)
  )
}
