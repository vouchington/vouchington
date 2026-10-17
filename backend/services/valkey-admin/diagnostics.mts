import type { GlideClient } from '@valkey/valkey-glide'
import { config } from '@data-stores/valkey-core/config'
import { buildWorkerQueueSettings } from '@data-stores/valkey-core/glide-mq-client'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import {
  countKeysByPrefix,
  getValkeyMemoryInfo,
  validateKeyPrefixRegistry,
  type ValkeyMemorySummary,
} from 'valkyries'
import type { FlushConcern, FlushTargetPrefixRegistry } from './concerns.mts'

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

export async function collectValkeyDiagnostics(
  client: ReadOnlyDiagnosticClient,
  topology: ValkeyDiagnosticTopology,
  registry: FlushTargetPrefixRegistry,
  signal?: AbortSignal,
): Promise<ValkeyDiagnosticResult> {
  assertSingleValkeyTopology(topology)
  validateKeyPrefixRegistry(registry)

  const memory = await getValkeyMemoryInfo(client, { signal })
  const observedFlushTargetKeyCounts = await countKeysByPrefix(client, registry, { signal })
  return { memory, observedFlushTargetKeyCounts }
}

export async function diagnoseValkey(
  registry: FlushTargetPrefixRegistry,
  signal?: AbortSignal,
): Promise<ValkeyDiagnosticResult> {
  return collectValkeyDiagnostics(
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
