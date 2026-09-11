import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { flush } from '@data-stores/analytics/backend-local'
import { query } from '@data-stores/analytics/query'
import { recordQueryTiming } from './query-telemetry.mts'

const uid = () => crypto.randomUUID()

function record(
  annotation: string | null,
  overrides: Partial<Parameters<typeof recordQueryTiming>[0]> = {},
) {
  recordQueryTiming({
    annotation,
    pool: 'read',
    durationMs: 1,
    rowCount: 0,
    error: false,
    ...overrides,
  })
}

async function waitForRow(annotation: string): Promise<Record<string, unknown>> {
  return await vi.waitFor(
    async () => {
      await flush()
      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM pg_query_timing WHERE annotation = '${annotation}'`,
      )
      if (!rows.length) throw new Error('pending')
      return rows[0]!
    },
    { timeout: 20_000, interval: 50 },
  )
}

async function countRows(annotation: string): Promise<number> {
  await flush()
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM pg_query_timing WHERE annotation = '${annotation}'`,
  )
  return rows.length
}

/**
 * Assert `annotation` was never emitted. A guaranteed barrier emit (whose record is queued after the
 * candidate) lands first under the shared FIFO emit promise, so once the barrier row is visible an
 * earlier candidate emit, had it fired, would already be present too.
 */
async function assertNoEmit(annotation: string): Promise<void> {
  const sentinel = uid()
  const saved = process.env.PG_QUERY_TIMING_SAMPLE
  process.env.PG_QUERY_TIMING_SAMPLE = ''
  record(sentinel)
  if (saved === undefined) delete process.env.PG_QUERY_TIMING_SAMPLE
  else process.env.PG_QUERY_TIMING_SAMPLE = saved
  await waitForRow(sentinel)
  expect(await countRows(annotation)).toBe(0)
}

describe('recordQueryTiming', () => {
  let testDir: string
  let prior: { backend?: string; dir?: string; sample?: string }

  beforeAll(async () => {
    prior = {
      backend: process.env.ANALYTICS_BACKEND,
      dir: process.env.ANALYTICS_LOCAL_DIR,
      sample: process.env.PG_QUERY_TIMING_SAMPLE,
    }
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pg-query-timing-test-'))
    process.env.ANALYTICS_LOCAL_DIR = testDir
    process.env.ANALYTICS_BACKEND = 'local'
    delete process.env.PG_QUERY_TIMING_SAMPLE
    // Warm the lazily-imported analytics barrel so the first emit's import() resolves promptly.
    await import('@data-stores/analytics')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env.ANALYTICS_BACKEND = 'local'
    delete process.env.PG_QUERY_TIMING_SAMPLE
  })

  afterAll(async () => {
    restore('ANALYTICS_BACKEND', prior.backend)
    restore('ANALYTICS_LOCAL_DIR', prior.dir)
    restore('PG_QUERY_TIMING_SAMPLE', prior.sample)
    await fs.promises.rm(testDir, { recursive: true, force: true })
  })

  it('emits a pg_query_timing row with the timing fields', async () => {
    const annotation = uid()
    record(annotation, {
      pool: 'write',
      durationMs: 42,
      rowCount: 7,
      error: true,
      cursorBatches: 3,
    })
    const row = await waitForRow(annotation)
    expect(row.annotation).toBe(annotation)
    expect(row.pool).toBe('write')
    expect(Number(row.duration_ms)).toBe(42)
    expect(Number(row.row_count)).toBe(7)
    expect(String(row.error)).toBe('true')
    expect(Number(row.cursor_batches)).toBe(3)
    expect(row.pipelined == null).toBe(true)
    expect(row.batch_size == null).toBe(true)
  })

  it('emits optional pipelined and batch_size when set', async () => {
    const annotation = uid()
    record(annotation, { pipelined: true, batchSize: 4 })
    const row = await waitForRow(annotation)
    expect(String(row.pipelined)).toBe('true')
    expect(Number(row.batch_size)).toBe(4)
    expect(row.cursor_batches == null).toBe(true)
  })

  it('records a null annotation as "unannotated"', async () => {
    const marker = uid()
    record(null, { pool: 'client', rowCount: 3, error: false, durationMs: 5 })
    const row = await vi.waitFor(
      async () => {
        await flush()
        const rows = await query<Record<string, unknown>>(
          `SELECT * FROM pg_query_timing WHERE annotation = 'unannotated' AND row_count = 3 AND pool = 'client'`,
        )
        if (!rows.length) throw new Error('pending')
        return rows[0]!
      },
      { timeout: 20_000, interval: 50 },
    )
    expect(row.annotation).toBe('unannotated')
    expect(marker).toBeDefined()
  })

  it('is a no-op when ANALYTICS_BACKEND is disabled', async () => {
    const annotation = uid()
    process.env.ANALYTICS_BACKEND = 'disabled'
    record(annotation)
    process.env.ANALYTICS_BACKEND = 'local'
    await assertNoEmit(annotation)
  })

  it('does not emit when PG_QUERY_TIMING_SAMPLE is 0', async () => {
    const annotation = uid()
    process.env.PG_QUERY_TIMING_SAMPLE = '0'
    record(annotation)
    await assertNoEmit(annotation)
  })

  it('emits when the sample rate is >= 1', async () => {
    const annotation = uid()
    process.env.PG_QUERY_TIMING_SAMPLE = '1.5'
    record(annotation)
    expect(await waitForRow(annotation)).toBeDefined()
  })

  it('emits when the sample rate is not a finite number', async () => {
    const annotation = uid()
    process.env.PG_QUERY_TIMING_SAMPLE = 'abc'
    record(annotation)
    expect(await waitForRow(annotation)).toBeDefined()
  })

  it('emits a fractional-rate query when Math.random falls below the rate', async () => {
    const annotation = uid()
    process.env.PG_QUERY_TIMING_SAMPLE = '0.5'
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    record(annotation)
    expect(await waitForRow(annotation)).toBeDefined()
  })

  it('drops a fractional-rate query when Math.random is at or above the rate', async () => {
    const annotation = uid()
    process.env.PG_QUERY_TIMING_SAMPLE = '0.5'
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    record(annotation)
    await assertNoEmit(annotation)
  })
  // This file runs under vitest, so NODE_ENV === 'test' is always true here — exactly the branch
  // under test. See query-telemetry.mts for why durationMs, not the (unavailable) SQLSTATE, is the
  // discriminator between a routine fast constraint-violation failure and a genuine stall.
  //
  // Nested inside this describe (not a sibling) so it inherits the afterEach(vi.restoreAllMocks())
  // above — a sibling describe would leak process.stderr.write's mock/call-history across these
  // tests and would run after this block's afterAll already reset ANALYTICS_BACKEND.
  describe('maybeLogTestQueryFailure', () => {
    it('logs a [pg-query-failed] stderr line for a slow, errored query', async () => {
      const annotation = uid()
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
      record(annotation, { durationMs: 20_003, error: true })
      expect(stderrSpy).toHaveBeenCalledWith(
        `[pg-query-failed] annotation=${annotation} pool=read ms=20003\n`,
      )
      // The new branch runs before the ANALYTICS_BACKEND early-out and must not swallow it.
      const row = await waitForRow(annotation)
      expect(String(row.error)).toBe('true')
    })

    it('stays silent for a fast, errored query (at the threshold)', () => {
      const annotation = uid()
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
      record(annotation, { durationMs: 500, error: true })
      expect(stderrSpy).not.toHaveBeenCalled()
    })

    it('stays silent for a slow, successful query', () => {
      const annotation = uid()
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
      record(annotation, { durationMs: 5000, error: false })
      expect(stderrSpy).not.toHaveBeenCalled()
    })
  })
})

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
