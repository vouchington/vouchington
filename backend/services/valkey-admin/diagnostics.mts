import { Decoder, InfoOptions, type GlideClient, type GlideString } from '@valkey/valkey-glide'
import { config } from '@data-stores/valkey-core/config'
import { buildWorkerQueueSettings } from '@data-stores/valkey-core/glide-mq-client'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import type { FlushConcern, FlushTargetPrefixRegistry } from './concerns.mts'
import { parseValkeyMemoryInfo, type ValkeyMemorySummary } from './memory-info.mts'

export { parseValkeyMemoryInfo, type ValkeyMemorySummary } from './memory-info.mts'

const SCAN_COUNT = 500

export type ObservedFlushTargetKeyCounts = Record<FlushConcern | 'unclassified', number>

export type ValkeyDiagnosticResult = {
  memory: ValkeyMemorySummary
  observedFlushTargetKeyCounts: ObservedFlushTargetKeyCounts
}

type ReadOnlyDiagnosticClient = Pick<GlideClient, 'info' | 'scan'>

export type ValkeyDiagnosticTopology = {
  databaseUrls: readonly string[]
  workerQueueUrl: string
}

export function assertSingleValkeyTopology(topology: ValkeyDiagnosticTopology): void {
  if (topology.databaseUrls.length === 0) {
    throw new Error('No Valkey database URLs were configured')
  }
  const [expected, ...remaining] = [
    ...topology.databaseUrls.map(url => normalizeValkeyEndpoint(url)),
    normalizeWorkerQueueEndpoint(topology.workerQueueUrl),
  ]
  if (remaining.some(endpoint => endpoint !== expected)) {
    throw new Error('Valkey diagnostics require one shared endpoint and database')
  }
}

export function validateFlushTargetPrefixRegistry(registry: FlushTargetPrefixRegistry): void {
  const targets = Object.entries(registry).flatMap(([concern, prefixes]) =>
    prefixes.map(prefix => ({ concern, prefix })),
  )
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index]!
    if (target.prefix === '') throw new Error(`Empty flush target prefix for ${target.concern}`)
    for (let otherIndex = index + 1; otherIndex < targets.length; otherIndex += 1) {
      const other = targets[otherIndex]!
      if (target.prefix.startsWith(other.prefix) || other.prefix.startsWith(target.prefix)) {
        throw new Error(
          `Overlapping flush target prefixes for ${target.concern} and ${other.concern}`,
        )
      }
    }
  }
}

export async function collectValkeyDiagnostics(
  client: ReadOnlyDiagnosticClient,
  topology: ValkeyDiagnosticTopology,
  registry: FlushTargetPrefixRegistry,
  signal?: AbortSignal,
): Promise<ValkeyDiagnosticResult> {
  assertSingleValkeyTopology(topology)
  validateFlushTargetPrefixRegistry(registry)

  signal?.throwIfAborted()
  const memoryInfo = await client.info([InfoOptions.Memory])
  signal?.throwIfAborted()
  const memory = parseValkeyMemoryInfo(memoryInfo)
  const observedFlushTargetKeyCounts = createEmptyObservedCounts()
  let cursor: GlideString = '0'
  do {
    signal?.throwIfAborted()
    // oxlint-disable-next-line no-await-in-loop -- each SCAN advances the cursor for the next bounded page
    const [nextCursor, keys] = await client.scan(cursor, {
      match: '*',
      count: SCAN_COUNT,
      decoder: Decoder.String,
    })
    cursor = nextCursor
    signal?.throwIfAborted()
    for (const key of keys) {
      if (typeof key !== 'string') throw new Error('Valkey SCAN returned a non-string key')
      const concern = classifyKey(key, registry)
      observedFlushTargetKeyCounts[concern ?? 'unclassified'] += 1
    }
  } while (cursor !== '0')

  return { memory, observedFlushTargetKeyCounts }
}

export async function diagnoseValkey(
  registry: FlushTargetPrefixRegistry,
  signal?: AbortSignal,
): Promise<ValkeyDiagnosticResult> {
  return await collectValkeyDiagnostics(
    sessionValkeyClient,
    getConfiguredValkeyTopology(),
    registry,
    signal,
  )
}

function getConfiguredValkeyTopology(): ValkeyDiagnosticTopology {
  return {
    databaseUrls: [
      config.session_url,
      config.cache_url,
      config.rate_limiter_url,
      config.dynamic_config_url,
      config.bloom_url,
    ],
    workerQueueUrl: config.worker_queue_url,
  }
}

function normalizeValkeyEndpoint(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error('Valkey topology URL must use redis: or rediss:')
  }
  const database = url.pathname.replace(/^\/+/, '') || '0'
  if (!/^\d+$/.test(database)) throw new Error('Valkey topology URL has an invalid database')
  return `${url.protocol}//${url.hostname.toLowerCase()}:${url.port || '6379'}/${Number(database)}`
}

function normalizeWorkerQueueEndpoint(value: string): string {
  buildWorkerQueueSettings(value)
  const url = new URL(value)
  url.pathname = '/0'
  return normalizeValkeyEndpoint(url.toString())
}

function createEmptyObservedCounts(): ObservedFlushTargetKeyCounts {
  return {
    caches: 0,
    'recently-viewed': 0,
    blooms: 0,
    'rate-limiter': 0,
    'dynamic-config': 0,
    sessions: 0,
    queues: 0,
    unclassified: 0,
  }
}

function classifyKey(key: string, registry: FlushTargetPrefixRegistry): FlushConcern | undefined {
  for (const [concern, prefixes] of Object.entries(registry) as Array<
    [FlushConcern, readonly string[]]
  >) {
    if (prefixes.some(prefix => key.startsWith(prefix))) return concern
  }
  return undefined
}
