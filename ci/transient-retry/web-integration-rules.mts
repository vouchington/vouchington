import { ciAggregateFailureJobNames } from './ci-aggregate-failure-jobs.mts'
import { stripAnsi } from './storybook-shared.mts'
import type { TransientRetryRule } from './types.mts'
import {
  hasUndiciConnectionRefused,
  hasUndiciSocketClosed,
} from './undici-transport-fingerprints.mts'
import { POST_READY_EXIT_MARKER_PREFIX } from '../../integration-tests/web/helpers/exit-diagnostics.mts'
import { isWebIntegrationShardJob } from './runner-shutdown-consumer-registry.mts'

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
  exampleRunIds: ['32537258712', '33791168511'],
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
