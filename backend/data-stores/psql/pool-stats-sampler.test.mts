import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { flush } from '@data-stores/analytics/backend-local'
import { query } from '@data-stores/analytics/query'
import {
  emitPoolStats,
  startPoolStatsSampler,
  stopPoolStatsSampler,
  type SampledPools,
} from './pool-stats-sampler.mts'

function fakePool(total: number, idle: number, waiting: number): import('pg').Pool {
  return {
    totalCount: total,
    idleCount: idle,
    waitingCount: waiting,
  } as unknown as import('pg').Pool
}

async function waitForPoolRows(
  sentinel: number,
  expected: number,
): Promise<Record<string, unknown>[]> {
  return await vi.waitFor(
    async () => {
      await flush()
      // No ORDER BY: the DuckDB-less JSONL fallback (used in CI, where the duckdb binary is
      // absent) bails on ORDER BY/aggregate shapes. Callers sort the two rows in JS instead.
      // `sentinel` is a generated integer; quotes keep JSONL fallback text comparison aligned.
      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM pg_pool_stats WHERE waiting = '${sentinel}'`,
      )
      if (rows.length < expected) throw new Error('pending')
      return rows
    },
    { timeout: 20_000, interval: 50 },
  )
}

describe('pool-stats-sampler', () => {
  let testDir: string
  let prior: { backend?: string; dir?: string; interval?: string }

  beforeAll(async () => {
    prior = {
      backend: process.env.ANALYTICS_BACKEND,
      dir: process.env.ANALYTICS_LOCAL_DIR,
      interval: process.env.PG_POOL_STATS_INTERVAL_MS,
    }
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pg-pool-stats-test-'))
    process.env.ANALYTICS_LOCAL_DIR = testDir
    process.env.ANALYTICS_BACKEND = 'local'
    delete process.env.PG_POOL_STATS_INTERVAL_MS
    // Warm the lazily-imported analytics barrel so the first emit's import() resolves promptly
    // instead of racing the poll under CI load.
    await import('@data-stores/analytics')
  })

  afterEach(() => {
    stopPoolStatsSampler()
    process.env.ANALYTICS_BACKEND = 'local'
    delete process.env.PG_POOL_STATS_INTERVAL_MS
  })

  afterAll(async () => {
    restore('ANALYTICS_BACKEND', prior.backend)
    restore('ANALYTICS_LOCAL_DIR', prior.dir)
    restore('PG_POOL_STATS_INTERVAL_MS', prior.interval)
    await fs.promises.rm(testDir, { recursive: true, force: true })
  })

  it('emits exactly one gauge row per pool with the connection counts', async () => {
    const sentinel = Math.floor(Math.random() * 1_000_000_000)
    const pools: SampledPools = {
      write: fakePool(10, 4, sentinel),
      read: fakePool(8, 8, sentinel),
      advisoryLock: fakePool(1, 0, sentinel),
      readMax: 12,
      writeMax: 20,
      advisoryLockMax: 4,
    }
    emitPoolStats(pools)

    const rows = await waitForPoolRows(sentinel, 3)
    expect(rows).toHaveLength(3)
    const readRow = rows.find(r => r.pool === 'read')!
    const writeRow = rows.find(r => r.pool === 'write')!
    const advisoryLockRow = rows.find(r => r.pool === 'advisory-lock')!
    expect(Number(writeRow.total)).toBe(10)
    expect(Number(writeRow.idle)).toBe(4)
    expect(Number(writeRow.max)).toBe(20)
    expect(Number(readRow.total)).toBe(8)
    expect(Number(readRow.idle)).toBe(8)
    expect(Number(readRow.max)).toBe(12)
    expect(Number(advisoryLockRow.total)).toBe(1)
    expect(Number(advisoryLockRow.idle)).toBe(0)
    expect(Number(advisoryLockRow.max)).toBe(4)
  })

  it('does not start a timer when analytics is disabled', () => {
    const pools: SampledPools = {
      write: fakePool(1, 1, 0),
      read: fakePool(1, 1, 0),
      advisoryLock: fakePool(0, 0, 0),
      readMax: 1,
      writeMax: 1,
      advisoryLockMax: 1,
    }
    process.env.ANALYTICS_BACKEND = 'disabled'
    process.env.PG_POOL_STATS_INTERVAL_MS = '25'
    startPoolStatsSampler(pools)
    delete process.env.PG_POOL_STATS_INTERVAL_MS
    startPoolStatsSampler(pools)
    // No timer was created, so a follow-up stop is a safe no-op.
    expect(() => stopPoolStatsSampler()).not.toThrow()
  })

  it('starts at most one timer and stops cleanly when analytics is enabled', () => {
    const pools: SampledPools = {
      write: fakePool(1, 1, 0),
      read: fakePool(1, 1, 0),
      advisoryLock: fakePool(0, 0, 0),
      readMax: 1,
      writeMax: 1,
      advisoryLockMax: 1,
    }
    process.env.ANALYTICS_BACKEND = 'local'
    startPoolStatsSampler(pools, 3_600_000)
    // A second start is idempotent: the existing timer short-circuits the guard.
    startPoolStatsSampler(pools, 3_600_000)
    expect(() => stopPoolStatsSampler()).not.toThrow()
    // A second stop with no timer is also safe.
    expect(() => stopPoolStatsSampler()).not.toThrow()
  })
})

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
