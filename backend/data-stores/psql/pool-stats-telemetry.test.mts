import * as analytics from '@data-stores/analytics'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emitPoolStats } from './pool-stats-telemetry.mts'

describe('emitPoolStats', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('emits one pg_pool_stats record per pool stamped with the sample time', async () => {
    const sampledAt = new Date('2026-11-22T12:34:56.000Z')
    const records: Parameters<typeof analytics.emit>[1][] = []
    const emitted = Promise.withResolvers<void>()
    vi.spyOn(analytics, 'emit').mockImplementation((table, record) => {
      if (table !== 'pg_pool_stats') return
      records.push(record)
      if (records.length === 2) emitted.resolve()
    })

    emitPoolStats(
      [
        { pool: 'write', total: 5, idle: 2, waiting: 1, max: 10 },
        { pool: 'read', total: 3, idle: 3, waiting: 0, max: 10 },
      ],
      sampledAt,
    )
    await emitted.promise

    expect(records).toMatchObject([
      {
        pool: 'write',
        total: 5,
        idle: 2,
        waiting: 1,
        event_time: sampledAt,
        event_date: '2026-11-22',
      },
      {
        pool: 'read',
        total: 3,
        idle: 3,
        waiting: 0,
        event_time: sampledAt,
        event_date: '2026-11-22',
      },
    ])
  })
})
