import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { flush } from '@data-stores/analytics/backend-local'
import { query } from '@data-stores/analytics/query'
import { emitPoolStats, createPoolStatsSampler, type SampledPools } from './pool-stats-sampler.mts'

function fakePool(total: number, idle: number, waiting: number): SampledPools['write'] {
  return {
    totalCount: total,
    idleCount: idle,
    waitingCount: waiting,
  }
}

async function waitForPoolRows(
  sentinel: number,
  expected: number,
): Promise<Record<string, unknown>[]> {
  return vi.waitFor(
    async () => {
      await flush()
      // No ORDER BY: the DuckDB-less JSONL fallback (used in CI, where the duckdb binary is
      // absent) bails on ORDER BY/aggregate shapes. Callers sort the two rows in JS instead.
      // `sentinel` is a generated integer; quotes keep JSONL fallback text comparison aligned.
      const rows = await query(`SELECT * FROM pg_pool_stats WHERE waiting = '${sentinel}'`)
      if (rows.length < expected) throw new Error('pending')
      return rows
    },
    { timeout: 20_000, interval: 50 },
  )
}

describe('pool-stats-sampler', () => {
  let sampler: ReturnType<typeof createPoolStatsSampler>
  let clock: ReturnType<typeof createControlledPoolStatsClock>
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

  beforeEach(() => {
    clock = createControlledPoolStatsClock()
    sampler = createPoolStatsSampler(clock.schedule)
  })

  afterEach(async () => {
    await sampler[Symbol.asyncDispose]()
    vi.restoreAllMocks()
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
    process.env.ANALYTICS_BACKEND = 'disabled'
    process.env.PG_POOL_STATS_INTERVAL_MS = '25'
    sampler.startPoolStatsSampler(sampledPools(0))
    delete process.env.PG_POOL_STATS_INTERVAL_MS
    sampler.startPoolStatsSampler(sampledPools(0))
    expect(clock.schedule).not.toHaveBeenCalled()
  })

  it('starts one interval, samples on its tick, and cancels future ticks when disposed', async () => {
    const sentinel = Math.floor(Math.random() * 1_000_000_000)
    sampler.startPoolStatsSampler(sampledPools(sentinel), 100)
    sampler.startPoolStatsSampler(sampledPools(sentinel), 100)
    expect(clock.schedule).toHaveBeenCalledOnce()
    expect(clock.schedule).toHaveBeenCalledWith(expect.any(Function), 100)
    expect(clock.unref).toHaveBeenCalledOnce()
    clock.fire()
    await sampler[Symbol.asyncDispose]()
    await sampler[Symbol.asyncDispose]()
    expect(clock.dispose).toHaveBeenCalledOnce()
    clock.fire()
    expect(await waitForPoolRows(sentinel, 3)).toHaveLength(3)
  })

  it('unrefs and disposes its real Node interval', async () => {
    const interval = vi.spyOn(globalThis, 'setInterval')
    const clear = vi.spyOn(globalThis, 'clearInterval')
    let timer: ReturnType<typeof setInterval> | undefined
    try {
      {
        await using actual = createPoolStatsSampler()
        actual.startPoolStatsSampler(sampledPools(0), 3_600_000)
        expect(interval).toHaveBeenCalledOnce()
        timer = interval.mock.results[0]?.value
        expect(timer?.hasRef()).toBe(false)
      }
      expect(clear).toHaveBeenCalledWith(timer)
    } finally {
      interval.mockRestore()
      clear.mockRestore()
    }
  })

  it.each([
    ['25', 25],
    ['0', 60_000],
    ['invalid', 60_000],
  ])('uses the configured interval %s or its default', (configured, expected) => {
    process.env.PG_POOL_STATS_INTERVAL_MS = configured
    sampler.startPoolStatsSampler(sampledPools(0))
    expect(clock.schedule).toHaveBeenCalledWith(expect.any(Function), expected)
  })

  it('does not sample during prewarm', () => {
    const pools = sampledPools(0)
    sampler.startConfiguredPoolStatsSampler(
      {
        writePool: pools.write,
        readPool: pools.read,
        advisoryLockPool: pools.advisoryLock,
      },
      { readMax: 1, writeMax: 1, advisoryLockMax: 1 },
      true,
    )
    expect(clock.schedule).not.toHaveBeenCalled()
  })
})

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

function sampledPools(waiting: number): SampledPools {
  return {
    write: fakePool(1, 1, waiting),
    read: fakePool(1, 1, waiting),
    advisoryLock: fakePool(0, 0, waiting),
    readMax: 1,
    writeMax: 1,
    advisoryLockMax: 1,
  }
}

function createControlledPoolStatsClock() {
  let callback: (() => void) | undefined
  const unref = vi.fn<() => void>()
  const dispose = vi.fn<() => void>(() => {
    callback = undefined
  })
  const schedule = vi.fn<NonNullable<Parameters<typeof createPoolStatsSampler>[0]>>(
    nextCallback => {
      callback = nextCallback
      return { unref, dispose }
    },
  )
  return { schedule, unref, dispose, fire: () => callback?.() }
}
