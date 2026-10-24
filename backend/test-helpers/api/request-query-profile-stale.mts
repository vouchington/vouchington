// Report-only: lists baseline scopes not observed in complete local or CI profile logs.
// Usage: node backend/test-helpers/api/request-query-profile-stale.mts <complete-run-log>...
// Include all backend-unit shard output and the activitypub-capacity project output in each log.
// A scope is considered absent only when its matching diagnostic kind was present in the logs.
import { readFileSync } from 'node:fs'
import { shutdownDataStoresForOneOffCommand } from '@data-stores/graceful-shutdown'
import { onGracefulShutdown as closeValkey } from '@data-stores/valkey'
import app from './request-query-profile-registered-routes.mts'
import { parseRepeatBaseline } from '../request-query-profile-baseline.mts'
import { resolveRequestProfileRoute } from '../request-query-profile-route.mts'
import {
  buildStaleReport,
  MIN_STALE_EVIDENCE_LOGS,
} from '../request-query-profile-stale-report.mts'

try {
  await closeValkey.waitForInitialization()
  const baseline = parseRepeatBaseline(
    JSON.parse(
      readFileSync(new URL('./request-query-profile-baseline.json', import.meta.url), 'utf8'),
    ),
  )
  const logs = process.argv.slice(2).map(path => readFileSync(path, 'utf8'))
  const report = buildStaleReport(baseline, logs, route => resolveRequestProfileRoute(app, route))
  const totalScopes = baseline.reduce(
    (total, entry) => total + entry.routes.length + (entry.workers?.length ?? 0),
    0,
  )
  const staleScopeCount = report.stale.reduce(
    (total, candidate) =>
      total + candidate.entry.routes.length + (candidate.entry.workers?.length ?? 0),
    0,
  )

  for (const candidate of report.stale) {
    const { entry } = candidate
    const owner = 'issue' in entry ? `#${entry.issue}` : `permanent, ${entry.code}`
    const qualifier = report.sufficient ? 'stale' : 'possible stale; evidence incomplete'
    for (const route of entry.routes) {
      process.stdout.write(
        `${qualifier} route scope: ${entry.annotation} route=${route} (${owner})\n`,
      )
    }
    for (const worker of entry.workers ?? []) {
      process.stdout.write(
        `${qualifier} worker scope: ${entry.annotation} queue=${worker.queue} job=${worker.job} (${owner})\n`,
      )
    }
    if (report.sufficient) {
      process.stdout.write(
        candidate.fullyStale
          ? `remove the entire baseline entry for ${entry.annotation}\n`
          : `remove only these stale scopes for ${entry.annotation}; keep its remaining scopes\n`,
      )
    }
  }

  const fullyStaleEntries = report.stale.filter(candidate => candidate.fullyStale).length
  process.stdout.write(
    `${staleScopeCount} of ${totalScopes} ${report.sufficient ? 'scopes absent' : 'candidate scopes absent with incomplete evidence'} from ${baseline.length} entries across ${report.logCount} logs; ${fullyStaleEntries} entries fully stale\n`,
  )
  process.stdout.write(
    `diagnostics observed: ${report.requestProfileCount} HTTP profiles, ${report.workerProfileCount} worker profiles\n`,
  )
  process.stdout.write(
    `malformed diagnostics: ${report.malformedRequestProfileCount} HTTP profiles, ${report.malformedWorkerProfileCount} worker profiles\n`,
  )

  if (!report.sufficient) {
    process.stdout.write('warning: this report does not have complete diagnostic evidence\n')
    if (report.logCount < MIN_STALE_EVIDENCE_LOGS) {
      process.stdout.write(
        `warning: only ${report.logCount} logs given, fewer than the ${MIN_STALE_EVIDENCE_LOGS} required\n`,
      )
    }
    if (baseline.some(entry => entry.routes.length > 0) && report.requestProfileCount === 0) {
      process.stdout.write(
        'warning: no HTTP request-profile diagnostics; route scopes were not evaluated\n',
      )
    }
    if (
      baseline.some(entry => (entry.workers?.length ?? 0) > 0) &&
      report.workerProfileCount === 0
    ) {
      process.stdout.write(
        'warning: no worker-profile diagnostics; worker scopes were not evaluated\n',
      )
    }
    if (report.requestProfileCount === 0 && report.workerProfileCount === 0) {
      process.stdout.write('warning: empty or missing diagnostics cannot establish stale scopes\n')
    }
    if (report.malformedRequestProfileCount > 0 || report.malformedWorkerProfileCount > 0) {
      process.stdout.write('warning: malformed diagnostics prevent stale-scope removal advice\n')
    }
  }
} finally {
  await shutdownDataStoresForOneOffCommand()
}
