// Dependency-free fan-in for query-profile evidence produced by backend-unit shards.
import { readFileSync } from 'node:fs'

interface BaselineEntry {
  annotation: string
  routes: string[]
  workers?: Array<{ queue: string; job: string }>
}

interface Manifest {
  version: number
  shard: number
  shardTotal: number
  minimumEvidenceLogs: number
  requestProfileCount: number
  workerProfileCount: number
  malformedRequestProfileCount: number
  malformedWorkerProfileCount: number
  missingScopes: number[]
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function checkQueryProfileManifests(
  baseline: readonly BaselineEntry[],
  inputs: readonly unknown[],
) {
  const scopes = baseline.flatMap(entry => [
    ...entry.routes.map(route => `${entry.annotation} route=${route}`),
    ...(entry.workers ?? []).map(
      worker => `${entry.annotation} queue=${worker.queue} job=${worker.job}`,
    ),
  ])
  let missing = new Set(scopes.map((_, index) => index))
  let requests = 0
  let workers = 0
  let malformedRequests = 0
  let malformedWorkers = 0
  let minimumEvidenceLogs: number | undefined
  for (const [index, input] of inputs.entries()) {
    const manifest = input as Partial<Manifest> | null
    if (
      !manifest ||
      typeof manifest !== 'object' ||
      Array.isArray(manifest) ||
      manifest.version !== 1 ||
      manifest.shard !== index + 1 ||
      manifest.shardTotal !== inputs.length ||
      !nonnegativeInteger(manifest.minimumEvidenceLogs) ||
      manifest.minimumEvidenceLogs < 1 ||
      (minimumEvidenceLogs !== undefined && manifest.minimumEvidenceLogs !== minimumEvidenceLogs) ||
      !nonnegativeInteger(manifest.requestProfileCount) ||
      !nonnegativeInteger(manifest.workerProfileCount) ||
      !nonnegativeInteger(manifest.malformedRequestProfileCount) ||
      !nonnegativeInteger(manifest.malformedWorkerProfileCount) ||
      !Array.isArray(manifest.missingScopes)
    )
      throw new Error(`Invalid query-profile hit manifest for shard ${index + 1}`)
    minimumEvidenceLogs = manifest.minimumEvidenceLogs
    requests += manifest.requestProfileCount
    workers += manifest.workerProfileCount
    malformedRequests += manifest.malformedRequestProfileCount
    malformedWorkers += manifest.malformedWorkerProfileCount
    const nextMissing = new Set<number>()
    for (const scope of manifest.missingScopes) {
      if (missing.has(scope)) nextMissing.add(scope)
    }
    missing = nextMissing
  }
  if (![requests, workers, malformedRequests, malformedWorkers].every(Number.isSafeInteger)) {
    throw new Error('Query-profile diagnostic counts exceed the supported range')
  }
  const sufficient =
    inputs.length >= (minimumEvidenceLogs ?? Infinity) &&
    (requests > 0 || workers > 0) &&
    (baseline.every(entry => entry.routes.length === 0) || requests > 0) &&
    (baseline.every(entry => !entry.workers?.length) || workers > 0) &&
    malformedRequests === 0 &&
    malformedWorkers === 0
  return {
    sufficient,
    scopeCount: scopes.length,
    shardCount: inputs.length,
    requestProfileCount: requests,
    workerProfileCount: workers,
    staleScopes: [...missing].toSorted((a, b) => a - b).map(scope => scopes[scope]!),
  }
}

if (import.meta.main) {
  try {
    const baseline = JSON.parse(
      readFileSync(new URL('./request-query-profile-baseline.json', import.meta.url), 'utf8'),
    ) as BaselineEntry[]
    const result = checkQueryProfileManifests(
      baseline,
      process.argv.slice(2).map(path => JSON.parse(readFileSync(path, 'utf8'))),
    )
    if (!result.sufficient) {
      process.stderr.write('error: this check does not have complete diagnostic evidence\n')
      process.exitCode = 2
    } else {
      process.stdout.write(
        `${result.staleScopes.length} of ${result.scopeCount} scopes absent across ${result.shardCount} shards; diagnostics observed: ${result.requestProfileCount} HTTP profiles, ${result.workerProfileCount} worker profiles\n`,
      )
      for (const scope of result.staleScopes) process.stdout.write(`stale scope: ${scope}\n`)
      if (result.staleScopes.length) process.exitCode = 1
    }
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exitCode = 2
  }
}
