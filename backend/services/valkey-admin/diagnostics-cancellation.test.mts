import type { GlideClient } from '@valkey/valkey-glide'
import { describe, expect, it } from 'vitest'
import { collectValkeyDiagnostics } from './diagnostics.mts'
import { createFlushTargetPrefixRegistry } from './flush-targets.mts'

const COMPLETE_INFO = `# Memory
used_memory:100
used_memory_rss:120
used_memory_peak:140
maxmemory:1000
maxmemory_policy:noeviction`

const topology = {
  databaseUrls: ['redis://localhost:6379'],
  workerQueueUrl: 'redis://localhost:6379',
}
const registry = createFlushTargetPrefixRegistry(['glide:usage:'])

describe('Valkey diagnostic cancellation', () => {
  it('stops before scanning when cancellation arrives during INFO', async () => {
    const controller = new AbortController()
    const reason = new Error('cancel diagnostics')
    let scanCalls = 0
    const client = {
      async info() {
        controller.abort(reason)
        return COMPLETE_INFO
      },
      async scan() {
        scanCalls += 1
        return ['0', []]
      },
    } as unknown as Pick<GlideClient, 'info' | 'scan'>

    await expect(
      collectValkeyDiagnostics(client, topology, registry, controller.signal),
    ).rejects.toBe(reason)
    expect(scanCalls).toBe(0)
  })

  it('does not request another diagnostic page after cancellation', async () => {
    const controller = new AbortController()
    const reason = new Error('cancel diagnostic scan')
    let scanCalls = 0
    const client = {
      async info() {
        return COMPLETE_INFO
      },
      async scan() {
        scanCalls += 1
        controller.abort(reason)
        return ['1', []]
      },
    } as unknown as Pick<GlideClient, 'info' | 'scan'>

    await expect(
      collectValkeyDiagnostics(client, topology, registry, controller.signal),
    ).rejects.toBe(reason)
    expect(scanCalls).toBe(1)
  })
})
