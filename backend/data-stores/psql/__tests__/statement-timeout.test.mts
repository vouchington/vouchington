import { describe, it, expect, vi } from 'vitest'
import {
  captureDefaultStatementTimeoutAttribution,
  getReadPoolStatementTimeout,
  getWritePoolStatementTimeout,
  runStatementTimeoutAttributionProbe,
  TEST_STATEMENT_TIMEOUT_MS,
} from '../../../test-helpers/data-stores/psql/statement-timeout.mts'

// Guards the per-session startup settings installed before global setup and worker pools open.
describe('test-database statement_timeout bound', () => {
  it('applies TEST_STATEMENT_TIMEOUT_MS to a session opened by the read pool', async () => {
    expect(await getReadPoolStatementTimeout()).toBe(TEST_STATEMENT_TIMEOUT_MS)
  })

  it('applies TEST_STATEMENT_TIMEOUT_MS to a session opened by the write pool', async () => {
    expect(await getWritePoolStatementTimeout()).toBe(TEST_STATEMENT_TIMEOUT_MS)
  })
})

describe('statement_timeout firing and attribution', () => {
  it('attributes the default deadline and restores the cancelled connection before reuse', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    try {
      const result = await captureDefaultStatementTimeoutAttribution()
      expect(result.failure).toMatchObject({ code: '57014' })
      expect(result.before).toMatchObject({ timeout_ms: TEST_STATEMENT_TIMEOUT_MS })
      expect(result.after).toEqual({
        pid: result.before?.pid,
        timeout_ms: TEST_STATEMENT_TIMEOUT_MS,
        usable: 1,
      })
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[pg-query-failed] annotation=guardDefaultStatementTimeoutProbe pool=client',
        ),
      )
    } finally {
      stderrSpy.mockRestore()
    }
  })

  // An owned advisory lock blocks the probe until its statement deadline fires.
  // This exercises attribution without sleeping or altering any shared schema object.
  it('fires 57014 and names the query on stderr when a statement exceeds its bound', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    try {
      await expect(runStatementTimeoutAttributionProbe()).rejects.toMatchObject({ code: '57014' })

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('[pg-query-failed] annotation=guardStatementTimeoutProbe'),
      )
    } finally {
      stderrSpy.mockRestore()
    }
  })
})
