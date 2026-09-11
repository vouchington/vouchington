import { ciAggregateFailureJobNames } from './ci-aggregate-failure-jobs.mts'
import { stripAnsi } from './storybook-shared.mts'
import type { TransientRetryRule } from './types.mts'
import {
  hasUndiciConnectionRefused,
  hasUndiciSocketClosed,
} from './undici-transport-fingerprints.mts'
import { POST_READY_EXIT_MARKER_PREFIX } from '../../integration-tests/web/helpers/exit-diagnostics.mts'
import { isWebIntegrationShardJob } from './runner-shutdown-consumers.mts'

function hasSilentBackendStartupExit(log: string): boolean {
  const plainLog = stripAnsi(log)
  const startupErrorMarker =
    'Service backend exited with code 1 before becoming ready at http://127.0.0.1:'
  const startupErrorParts = plainLog.split(startupErrorMarker)
  if (startupErrorParts.length === 1) return false

  const startupError = `${startupErrorMarker}${startupErrorParts.at(-1) ?? ''}`
  const recentServiceLog = recentServiceLogSection(startupError)
  return (
    plainLog.includes('Run web integration tests') &&
    plainLog.includes('[web-integration] Preparing data stores...') &&
    plainLog.includes('No test files found, exiting with code 1') &&
    startupError.includes('Service log:') &&
    recentServiceLog === '[backend] exited with code 1' &&
    !plainLog.includes('[web-integration] Services are ready.') &&
    !/\bFAIL\s+\S+/u.test(plainLog) &&
    !plainLog.includes('Failed Tests')
  )
}

function recentServiceLogSection(startupError: string): string {
  const marker = 'Recent service log:\n'
  const markerIndex = startupError.indexOf(marker)
  if (markerIndex === -1) return ''

  const lines = startupError
    .slice(markerIndex + marker.length)
    .split('\n')
    .map(line => stripGithubLogPrefix(line).trimEnd())
  const serviceLogEndIndex = lines.findIndex(
    line => line.startsWith('##[') || /^\s+at\b/u.test(line),
  )
  return lines.slice(0, serviceLogEndIndex === -1 ? undefined : serviceLogEndIndex).join('\n')
}

function stripGithubLogPrefix(line: string): string {
  return line.replace(/^(?:[^\t\n]*\t[^\t\n]*\t)?\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z\s+/u, '')
}

export const mainWebIntegrationBackendSilentStartupExitRule: TransientRetryRule = {
  id: 'main-web-integration-backend-silent-startup-exit',
  consumerKey: 'web-integration-backend-startup',
  rootCauseKey: 'backend-startup-diagnostic-race',
  description:
    'Main CI web-integration backend exits during startup before tests run, and the service log contains only the harness exit line.',
  rationale:
    'The failure happens before any web-api or web-integration test file runs, after CI setup completed, and the harness lost the backend child stderr. A single rerun recovers this startup-only no-diagnostic shape while repeated or diagnostic-bearing failures still dispatch Harness.',
  exampleRunUrls: ['https://github.com/jonathanong/filaments/actions/runs/29501061688'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.workflowName !== 'Main CI (web)' || ctx.conclusion !== 'failure') return false
    const [webIntegrationJobName] = ctx.failedJobNames
    if (
      ctx.failedJobNames.length !== 1 ||
      !webIntegrationJobName ||
      !isWebIntegrationShardJob(webIntegrationJobName)
    ) {
      return false
    }

    const logs = await ctx.failedJobLogs()
    return hasSilentBackendStartupExit(logs.get(webIntegrationJobName) ?? '')
  },
}

// The two shapes this rule covers are the same underlying defect (#10819: an upstream wrangler
// crash the repo's own supervised restart, restart-policy.mts, recovers from) observed at two
// different points in that recovery:
// - A single crash mid-suite, recovered within the restart window: in-flight requests see the
//   socket drop as it happens (UND_ERR_SOCKET).
// - The restart budget exhausted (a burst of crashes, or the supervisor itself killed): the worker
//   port stays closed for the rest of the run, so every later request is refused outright
//   (ECONNREFUSED), and exit-diagnostics.mts's post-ready watcher reports the worker's exit.
function hasWranglerLocalSocketDrop(log: string): boolean {
  const plainLog = stripAnsi(log)
  if (
    plainLog.includes('Uncaught Error: Network connection lost') &&
    hasUndiciSocketClosed(plainLog)
  ) {
    return true
  }

  return (
    plainLog.includes(`${POST_READY_EXIT_MARKER_PREFIX} worker exited unexpectedly after ready`) &&
    hasUndiciConnectionRefused(plainLog)
  )
}

export const webIntegrationWranglerSocketClosedRule: TransientRetryRule = {
  id: 'web-integration-wrangler-socket-closed',
  consumerKey: 'web-integration-local-worker',
  rootCauseKey: 'wrangler-network-connection-lost',
  description:
    'CI web-integration wrangler drops the local worker socket (undici UND_ERR_SOCKET), or its supervised-restart budget exhausts and the worker port stays closed for the rest of the run (undici ECONNREFUSED).',
  rationale:
    'Wrangler/workerd printed Network connection lost against the local worker, or the post-ready exit watcher reported the worker process gone; either way the same tests passed until the local worker socket was lost. One rerun recovers host-local transport loss without matching assertion failures such as route-baseline 500 versus 404.',
  exampleRunUrls: [
    'https://github.com/jonathanong/filaments/actions/runs/32537258712',
    'https://github.com/jonathanong/filaments/actions/runs/33791168511',
  ],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.workflowName !== 'CI' || ctx.conclusion !== 'failure') return false
    const webIntegrationJobName = ctx.failedJobNames.find(isWebIntegrationShardJob)
    if (!webIntegrationJobName) return false
    if (ctx.failedJobNames.filter(isWebIntegrationShardJob).length !== 1) return false
    if (
      ctx.failedJobNames.some(
        name => !isWebIntegrationShardJob(name) && !ciAggregateFailureJobNames.has(name),
      )
    ) {
      return false
    }

    const logs = await ctx.failedJobLogs()
    return hasWranglerLocalSocketDrop(logs.get(webIntegrationJobName) ?? '')
  },
}
