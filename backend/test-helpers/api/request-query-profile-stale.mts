// Fails when baseline scopes are not observed in complete local or CI profile logs.
// Usage: node backend/test-helpers/api/request-query-profile-stale.mts <complete-run-log>...
// CI: --collect <shard/total> <shard-log> <hit-manifest.json>, then --manifests <hit-manifest.json>...
// Together, the input logs must contain every backend-unit shard from one complete run.
// A scope is considered absent only when its matching diagnostic kind was present in the logs.
import { readFileSync, writeFileSync } from 'node:fs'
import {
  buildStaleReport,
  MIN_STALE_EVIDENCE_LOGS,
  parseRepeatBaseline,
} from 'vouchington-tooling/request-query-profile'
import {
  buildStaleReportFromHitManifests,
  collectQueryProfileHitManifest,
} from './request-query-profile-hit-manifest.mts'

let shutdownDataStores: (() => Promise<void>) | undefined
try {
  const baseline = parseRepeatBaseline(
    JSON.parse(
      readFileSync(new URL('./request-query-profile-baseline.json', import.meta.url), 'utf8'),
    ),
  )
  const args = process.argv.slice(2)
  let resolveRoute: (route: string) => string = () => {
    throw new Error('Request route resolver was not initialized')
  }
  if (args[0] !== '--manifests') {
    await import('../s3-test-environment.mts')
    const { shutdownDataStoresForOneOffCommand } = await import('@data-stores/graceful-shutdown')
    shutdownDataStores = shutdownDataStoresForOneOffCommand
    const { onGracefulShutdown: closeValkey } = await import('@data-stores/valkey')
    const { default: app } = await import('./request-query-profile-registered-routes.mts')
    const { resolveRequestProfileRoute } = await import('../request-query-profile-route.mts')
    await closeValkey.waitForInitialization()
    resolveRoute = route => resolveRequestProfileRoute(app, route)
  }
  if (args[0] === '--collect') {
    if (args.length !== 4) throw new Error('Expected shard/total, shard log, and manifest path')
    const match = /^([1-9]\d*)\/([1-9]\d*)$/u.exec(args[1]!)
    if (!match) throw new Error('Invalid backend-unit shard identity')
    const manifest = collectQueryProfileHitManifest(
      baseline,
      readFileSync(args[2]!, 'utf8'),
      Number(match[1]),
      Number(match[2]),
      resolveRoute,
    )
    writeFileSync(args[3]!, `${JSON.stringify(manifest)}\n`)
    process.stdout.write(
      `shard ${manifest.shard}/${manifest.shardTotal}: ${manifest.routeHits.length} route hits, ${manifest.workerHits.length} worker hits\n`,
    )
  } else {
    const report =
      args[0] === '--manifests'
        ? buildStaleReportFromHitManifests(
            baseline,
            args.slice(1).map(path => JSON.parse(readFileSync(path, 'utf8'))),
          )
        : buildStaleReport(
            baseline,
            args.map(path => readFileSync(path, 'utf8')),
            resolveRoute,
          )
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
      process.stderr.write('error: this check does not have complete diagnostic evidence\n')
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
        process.stdout.write(
          'warning: empty or missing diagnostics cannot establish stale scopes\n',
        )
      }
      if (report.malformedRequestProfileCount > 0 || report.malformedWorkerProfileCount > 0) {
        process.stdout.write('warning: malformed diagnostics prevent stale-scope removal advice\n')
      }
      process.exitCode = 2
    } else if (report.stale.length > 0) {
      process.exitCode = 1
    }
  }
} catch (err) {
  process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 2
} finally {
  await shutdownDataStores?.()
}
