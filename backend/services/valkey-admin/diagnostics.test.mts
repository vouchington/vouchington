import { randomUUID } from 'node:crypto'
import { config } from '@data-stores/valkey-core/config'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { describe, expect, it } from 'vitest'
import { getQueueFlushTargetPrefixes } from '@voucha/api/v1/valkey/queues-flush'
import { FLUSH_CONCERNS } from './concerns.mts'
import { diagnoseValkey } from './diagnostics.mts'
import { createFlushTargetPrefixRegistry } from './flush-targets.mts'

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

  it('rejects an overlapping target-prefix registry', async () => {
    await expect(
      diagnoseValkey(createFlushTargetPrefixRegistry(['cache:topics:queue:'])),
    ).rejects.toThrow('overlaps')
  })

  it('classifies owned prefixed keys through the configured Valkey', async () => {
    const suffix = randomUUID()
    const queuePrefix = `owned-diag:${suffix}:`
    const keys = [
      `cache:topics_with_redirect:v2:${suffix}`,
      `recently-viewed:${suffix}`,
      `bloom-filter:${suffix}`,
      `rate-limiter:test:{${suffix}}`,
      `dynamic-config:${suffix}`,
      `voucha:jwt-stale:${suffix}`,
      `${queuePrefix}job`,
      `unclassified-test:${suffix}`,
    ]
    await Promise.all(keys.map(key => sessionValkeyClient.set(key, 'x')))
    try {
      const result = await diagnoseValkey(createFlushTargetPrefixRegistry([queuePrefix]))
      expect(result.memory.usedMemoryBytes).toBeGreaterThan(0)
      expect(result.observedFlushTargetKeyCounts.queues).toBe(1)
      for (const concern of FLUSH_CONCERNS) {
        if (concern === 'queues') continue
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
