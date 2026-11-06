import {
  collectProfileObservations,
  findStaleBaselineEntries,
  MIN_STALE_EVIDENCE_LOGS,
  type RepeatBaselineEntry,
} from 'vouchington-tooling/request-query-profile'

export interface QueryProfileHitManifest {
  version: 1
  shard: number
  shardTotal: number
  minimumEvidenceLogs: number
  requestProfileCount: number
  workerProfileCount: number
  malformedRequestProfileCount: number
  malformedWorkerProfileCount: number
  missingScopes: number[]
}

/** Match one shard against the baseline with the pinned profile matcher. */
export function collectQueryProfileHitManifest(
  baseline: readonly RepeatBaselineEntry[],
  logText: string,
  shard: number,
  shardTotal: number,
  resolveRoute: (route: string) => string,
): QueryProfileHitManifest {
  if (
    !Number.isSafeInteger(shardTotal) ||
    shardTotal < 1 ||
    !Number.isSafeInteger(shard) ||
    shard < 1 ||
    shard > shardTotal
  ) {
    throw new Error('Invalid backend-unit shard identity')
  }
  const observed = collectProfileObservations([logText], resolveRoute)
  if (observed.malformedRequestProfileCount || observed.malformedWorkerProfileCount) {
    throw new Error('Malformed query-profile diagnostics in backend-unit shard log')
  }
  const stale = findStaleBaselineEntries(baseline, observed.routeScopes, observed.workerScopes)
  const missingScopes: number[] = []
  let scope = 0
  for (const [index, entry] of baseline.entries()) {
    for (const route of entry.routes) {
      if (
        stale.some(candidate => candidate.index === index && candidate.entry.routes.includes(route))
      )
        missingScopes.push(scope)
      scope++
    }
    for (const worker of entry.workers ?? []) {
      if (
        stale.some(
          candidate =>
            candidate.index === index &&
            candidate.entry.workers?.some(
              item => item.queue === worker.queue && item.job === worker.job,
            ),
        )
      )
        missingScopes.push(scope)
      scope++
    }
  }
  return {
    version: 1,
    shard,
    shardTotal,
    minimumEvidenceLogs: MIN_STALE_EVIDENCE_LOGS,
    requestProfileCount: observed.requestProfileCount,
    workerProfileCount: observed.workerProfileCount,
    malformedRequestProfileCount: observed.malformedRequestProfileCount,
    malformedWorkerProfileCount: observed.malformedWorkerProfileCount,
    missingScopes,
  }
}
