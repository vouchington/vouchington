import { randomUUID } from 'node:crypto'
import type { GlideClient } from '@valkey/valkey-glide'
import { config } from '@data-stores/valkey-core/config'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { describe, expect, it } from 'vitest'
import { getQueueFlushTargetPrefixes } from '@voucha/api/v1/valkey/queues-flush'
import { FLUSH_CONCERNS } from './concerns.mts'
import { collectValkeyDiagnostics, diagnoseValkey } from './diagnostics.mts'
import { createFlushTargetPrefixRegistry } from './flush-targets.mts'

const COMPLETE_INFO = `# Memory
used_memory:100
used_memory_rss:120
used_memory_peak:140
used_memory_dataset:80
maxmemory:1000
maxmemory_policy:noeviction
mem_fragmentation_ratio:1.2
lazyfree_pending_objects:3
ignored_secret:do-not-emit`

function makeReadOnlyClient(
  pages: Readonly<Record<string, readonly [string, string[]]>>,
  calls: Array<{ command: string; args: unknown[] }> = [],
): Pick<GlideClient, 'info' | 'scan'> {
  return {
    async info(sections) {
      calls.push({ command: 'info', args: [sections] })
      return COMPLETE_INFO
    },
    async scan(cursor, options) {
      calls.push({ command: 'scan', args: [cursor, options] })
      const page = pages[String(cursor)]
      if (!page) throw new Error(`Missing fake page for cursor ${String(cursor)}`)
      return page
    },
  } as Pick<GlideClient, 'info' | 'scan'>
}

function makeTopology(
  databaseUrls: readonly string[],
  workerQueueUrl: string = databaseUrls[0] ?? 'redis://localhost:6379/0',
) {
  return { databaseUrls, workerQueueUrl }
}

const diagnosticRegistry = createFlushTargetPrefixRegistry(['glide:usage:'])

function useConfiguredTopology(databaseUrls: readonly string[], workerQueueUrl?: string) {
  const base = databaseUrls[0]
  if (!base) throw new Error('Expected a Valkey topology URL')
  const previous = {
    session_url: config.session_url,
    cache_url: config.cache_url,
    rate_limiter_url: config.rate_limiter_url,
    dynamic_config_url: config.dynamic_config_url,
    bloom_url: config.bloom_url,
    worker_queue_url: config.worker_queue_url,
  }
  config.session_url = base
  config.cache_url = databaseUrls[1] ?? base
  config.rate_limiter_url = databaseUrls[2] ?? base
  config.dynamic_config_url = databaseUrls[3] ?? base
  config.bloom_url = databaseUrls[4] ?? base
  config.worker_queue_url = workerQueueUrl ?? base
  return () => {
    config.session_url = previous.session_url
    config.cache_url = previous.cache_url
    config.rate_limiter_url = previous.rate_limiter_url
    config.dynamic_config_url = previous.dynamic_config_url
    config.bloom_url = previous.bloom_url
    config.worker_queue_url = previous.worker_queue_url
  }
}

describe('Valkey diagnostics', () => {
  it('treats credential-only URL differences as one topology', async () => {
    const restore = useConfiguredTopology([
      'rediss://first:secret@valkey.voucha.ai:6380/0',
      'rediss://second:other@valkey.voucha.ai:6380/',
    ])
    try {
      await expect(diagnoseValkey(diagnosticRegistry)).resolves.toHaveProperty(
        'observedFlushTargetKeyCounts',
      )
    } finally {
      restore()
    }
  })

  it('treats the worker queue URL path as a DB-0 GlideMQ prefix', async () => {
    const restore = useConfiguredTopology(
      ['rediss://default:secret@valkey.voucha.ai:6380/0'],
      'rediss://default:secret@valkey.voucha.ai:6380/7',
    )
    try {
      await expect(diagnoseValkey(diagnosticRegistry)).resolves.toHaveProperty(
        'observedFlushTargetKeyCounts',
      )
    } finally {
      restore()
    }
  })

  it('rejects a real database split hidden by an equal worker queue path', async () => {
    const restore = useConfiguredTopology(
      ['rediss://default:secret@valkey.voucha.ai:6380/7'],
      'rediss://default:secret@valkey.voucha.ai:6380/7',
    )
    try {
      await expect(diagnoseValkey(diagnosticRegistry)).rejects.toThrow(
        'Valkey diagnostics require one shared endpoint and database',
      )
    } finally {
      restore()
    }
  })

  it('rejects protocol, host, port, or database topology splits', async () => {
    for (const differing of [
      'redis://valkey.voucha.ai:6380/0',
      'rediss://other.valkey.voucha.ai:6380/0',
      'rediss://valkey.voucha.ai:6379/0',
      'rediss://valkey.voucha.ai:6380/1',
    ]) {
      const restore = useConfiguredTopology(['rediss://valkey.voucha.ai:6380/0', differing])
      try {
        await expect(diagnoseValkey(diagnosticRegistry)).rejects.toThrow(
          'Valkey diagnostics require one shared endpoint and database',
        )
      } finally {
        restore()
      }
    }
  })

  it('rejects non-Valkey topology protocols', async () => {
    const restore = useConfiguredTopology(['https://valkey.voucha.ai:6380/0'])
    try {
      await expect(diagnoseValkey(diagnosticRegistry)).rejects.toThrow(
        'Valkey topology URL must use redis: or rediss:',
      )
    } finally {
      restore()
    }
  })

  it('rejects an overlapping target-prefix registry before any Valkey command', async () => {
    const calls: Array<{ command: string; args: unknown[] }> = []
    const client = makeReadOnlyClient({ '0': ['0', []] }, calls)

    await expect(
      collectValkeyDiagnostics(
        client,
        makeTopology(['redis://localhost:6379']),
        createFlushTargetPrefixRegistry(['cache:topics:queue:']),
      ),
    ).rejects.toThrow('overlaps')
    expect(calls).toEqual([])
  })

  it('classifies one multi-page SCAN into all concerns and unclassified observations', async () => {
    const registry = createFlushTargetPrefixRegistry(['custom:{emails}:', 'custom:usage:'])
    const client = makeReadOnlyClient({
      '0': [
        '1',
        [
          'cache:topics_with_redirect:v2:one',
          'recently-viewed:one',
          'bloom-filter:one',
          'rate-limiter:one',
        ],
      ],
      '1': [
        '0',
        [
          'dynamic-config:one',
          'voucha:jwt-stale:one',
          'custom:{emails}:job:one',
          'custom:{emails}:job:one',
          'other:key',
        ],
      ],
    })

    const result = await collectValkeyDiagnostics(
      client,
      makeTopology(['redis://one:secret@localhost:6379', 'redis://two:secret@localhost:6379/0']),
      registry,
    )
    expect(result.observedFlushTargetKeyCounts).toEqual({
      caches: 1,
      'recently-viewed': 1,
      blooms: 1,
      'rate-limiter': 1,
      'dynamic-config': 1,
      sessions: 1,
      queues: 2,
      unclassified: 1,
    })
  })

  it('classifies prefixed GlideMQ keys while scanning the shared DB-0 keyspace', async () => {
    const registry = createFlushTargetPrefixRegistry(getQueueFlushTargetPrefixes('voucha_qdb_7'))
    const client = makeReadOnlyClient({
      '0': ['0', ['voucha_qdb_7:{emails}:job:one']],
    })

    const result = await collectValkeyDiagnostics(
      client,
      makeTopology(['redis://localhost:6379/0'], 'redis://localhost:6379/7'),
      registry,
    )

    expect(result.observedFlushTargetKeyCounts.queues).toBe(1)
    expect(result.observedFlushTargetKeyCounts.unclassified).toBe(0)
  })

  it('reads only INFO memory and SCAN pages from the client', async () => {
    const calls: Array<{ command: string; args: unknown[] }> = []
    const client = makeReadOnlyClient({ '0': ['0', []] }, calls)
    await collectValkeyDiagnostics(
      client,
      makeTopology(['redis://localhost:6379']),
      createFlushTargetPrefixRegistry(['glide:usage:']),
    )

    expect(calls.map(call => call.command)).toEqual(['info', 'scan'])
  })

  it('does not remove randomized target or unrelated keys from real Valkey', async () => {
    const suffix = randomUUID()
    const queuePrefixes = getQueueFlushTargetPrefixes('glide')
    const queuePrefix = queuePrefixes[0]
    if (!queuePrefix) throw new Error('Expected at least one queue flush target prefix')
    const keys = [
      `cache:topics_with_redirect:v2:${suffix}`,
      `recently-viewed:${suffix}`,
      `bloom-filter:${suffix}`,
      `rate-limiter:test:{${suffix}}`,
      `dynamic-config:${suffix}`,
      `voucha:jwt-stale:${suffix}`,
      `${queuePrefix}${suffix}`,
      `unclassified-test:${suffix}`,
    ]
    await Promise.all(keys.map(key => sessionValkeyClient.set(key, 'x')))
    try {
      const result = await collectValkeyDiagnostics(
        sessionValkeyClient,
        makeTopology([process.env.VALKEY_URL ?? 'redis://localhost:6379']),
        createFlushTargetPrefixRegistry(queuePrefixes),
      )
      for (const concern of FLUSH_CONCERNS) {
        expect(result.observedFlushTargetKeyCounts[concern]).toBeGreaterThanOrEqual(1)
      }
      expect(result.observedFlushTargetKeyCounts.unclassified).toBeGreaterThanOrEqual(1)
      expect(await Promise.all(keys.map(key => sessionValkeyClient.exists([key])))).toEqual(
        keys.map(() => 1),
      )
    } finally {
      await sessionValkeyClient.unlink(keys)
    }
  })

  it('diagnoses the configured topology through the session client', async () => {
    const result = await diagnoseValkey(
      createFlushTargetPrefixRegistry(getQueueFlushTargetPrefixes('glide')),
    )
    expect(result.memory.usedMemoryBytes).toBeGreaterThan(0)
  })
})
