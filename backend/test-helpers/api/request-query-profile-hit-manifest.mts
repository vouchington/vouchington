import {
  collectProfileObservations,
  findStaleBaselineEntries,
  MIN_STALE_EVIDENCE_LOGS,
  type RepeatBaselineEntry,
  type StaleReport,
} from 'vouchington-tooling/request-query-profile'

export interface QueryProfileHitManifest {
  version: 1
  shard: number
  shardTotal: number
  requestProfileCount: number
  workerProfileCount: number
  malformedRequestProfileCount: number
  malformedWorkerProfileCount: number
  routeHits: string[]
  workerHits: string[]
}

function baselineScopeKeys(baseline: readonly RepeatBaselineEntry[]) {
  return {
    routes: new Set(
      baseline.flatMap(entry =>
        entry.routes.map(route => JSON.stringify([entry.annotation, route])),
      ),
    ),
    workers: new Set(
      baseline.flatMap(entry =>
        (entry.workers ?? []).map(worker =>
          JSON.stringify([entry.annotation, worker.queue, worker.job]),
        ),
      ),
    ),
  }
}

/** Keep only actual repeated scopes covered by this baseline, plus diagnostic-kind evidence. */
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
  const keys = baselineScopeKeys(baseline)
  return {
    version: 1,
    shard,
    shardTotal,
    requestProfileCount: observed.requestProfileCount,
    workerProfileCount: observed.workerProfileCount,
    malformedRequestProfileCount: observed.malformedRequestProfileCount,
    malformedWorkerProfileCount: observed.malformedWorkerProfileCount,
    routeHits: [...observed.routeScopes].filter(key => keys.routes.has(key)).toSorted(),
    workerHits: [...observed.workerScopes].filter(key => keys.workers.has(key)).toSorted(),
  }
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** Merge every successful shard while retaining the pinned stale-report sufficiency contract. */
export function buildStaleReportFromHitManifests(
  baseline: readonly RepeatBaselineEntry[],
  inputs: readonly unknown[],
): StaleReport {
  const keys = baselineScopeKeys(baseline)
  const routeScopes = new Set<string>()
  const workerScopes = new Set<string>()
  let requestProfileCount = 0
  let workerProfileCount = 0
  let malformedRequestProfileCount = 0
  let malformedWorkerProfileCount = 0

  for (const [index, value] of inputs.entries()) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Invalid query-profile hit manifest for shard ${index + 1}`)
    }
    const manifest = value as Partial<QueryProfileHitManifest>
    if (
      manifest.version !== 1 ||
      manifest.shard !== index + 1 ||
      manifest.shardTotal !== inputs.length ||
      !nonnegativeInteger(manifest.requestProfileCount) ||
      !nonnegativeInteger(manifest.workerProfileCount) ||
      !nonnegativeInteger(manifest.malformedRequestProfileCount) ||
      !nonnegativeInteger(manifest.malformedWorkerProfileCount) ||
      !Array.isArray(manifest.routeHits) ||
      !Array.isArray(manifest.workerHits) ||
      manifest.routeHits.some(key => typeof key !== 'string' || !keys.routes.has(key)) ||
      manifest.workerHits.some(key => typeof key !== 'string' || !keys.workers.has(key)) ||
      new Set(manifest.routeHits).size !== manifest.routeHits.length ||
      new Set(manifest.workerHits).size !== manifest.workerHits.length ||
      (manifest.routeHits.length > 0 && manifest.requestProfileCount === 0) ||
      (manifest.workerHits.length > 0 && manifest.workerProfileCount === 0)
    ) {
      throw new Error(`Invalid query-profile hit manifest for shard ${index + 1}`)
    }
    requestProfileCount += manifest.requestProfileCount
    workerProfileCount += manifest.workerProfileCount
    malformedRequestProfileCount += manifest.malformedRequestProfileCount
    malformedWorkerProfileCount += manifest.malformedWorkerProfileCount
    for (const key of manifest.routeHits) routeScopes.add(key)
    for (const key of manifest.workerHits) workerScopes.add(key)
  }
  if (
    !Number.isSafeInteger(requestProfileCount) ||
    !Number.isSafeInteger(workerProfileCount) ||
    !Number.isSafeInteger(malformedRequestProfileCount) ||
    !Number.isSafeInteger(malformedWorkerProfileCount)
  ) {
    throw new Error('Query-profile diagnostic counts exceed the supported range')
  }

  const requiresRequests = baseline.some(entry => entry.routes.length > 0)
  const requiresWorkers = baseline.some(entry => (entry.workers?.length ?? 0) > 0)
  const sufficient =
    inputs.length >= MIN_STALE_EVIDENCE_LOGS &&
    (requestProfileCount > 0 || workerProfileCount > 0) &&
    (!requiresRequests || requestProfileCount > 0) &&
    (!requiresWorkers || workerProfileCount > 0) &&
    malformedRequestProfileCount === 0 &&
    malformedWorkerProfileCount === 0

  return {
    logCount: inputs.length,
    requestProfileCount,
    workerProfileCount,
    malformedRequestProfileCount,
    malformedWorkerProfileCount,
    sufficient,
    stale: findStaleBaselineEntries(
      baseline,
      requestProfileCount > 0 && malformedRequestProfileCount === 0 ? routeScopes : keys.routes,
      workerProfileCount > 0 && malformedWorkerProfileCount === 0 ? workerScopes : keys.workers,
    ),
  }
}
