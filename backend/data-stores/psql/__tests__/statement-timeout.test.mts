import { describe, it, expect, vi } from 'vitest'
import {
  getReadPoolStatementTimeout,
  getWritePoolStatementTimeout,
  runStatementTimeoutAttributionProbe,
  TEST_STATEMENT_TIMEOUT_MS,
} from '../../../test-helpers/data-stores/psql/statement-timeout.mts'

// Guards the boundStatementTimeoutForTestDatabase() call in vitest.setup.data-stores.mts: without
// it, statement_timeout is unbounded in tests (0, from getPsqlPoolConfiguration()'s test branch)
// and a stuck query fails only via vitest's opaque, unattributed testTimeout. The companion check
// that TEST_STATEMENT_TIMEOUT_MS stays below the backend-data-stores project testTimeout lives in
// ci/vitest-backend-config.test.mts, not here — that assertion needs `vitest/config`, which pulls
// in lib.dom transitively (see backend/types/lib-dom-absent.mts) and must never enter this program.
describe('test-database statement_timeout bound', () => {
  it('applies TEST_STATEMENT_TIMEOUT_MS to a session opened by the read pool', async () => {
    expect(await getReadPoolStatementTimeout()).toBe(TEST_STATEMENT_TIMEOUT_MS)
  })

  it('applies TEST_STATEMENT_TIMEOUT_MS to a session opened by the write pool', async () => {
    expect(await getWritePoolStatementTimeout()).toBe(TEST_STATEMENT_TIMEOUT_MS)
  })
})

describe('statement_timeout firing and attribution', () => {
  // Probes at statementTimeoutMs: 750 / pg_sleep(2), not the real 20s TEST_STATEMENT_TIMEOUT_MS —
  // that would burn 20s of the 30s testTimeout on every run. 750ms still clears the 500ms noise
  // gate in query-telemetry.mts's maybeLogTestQueryFailure, so this exercises the same attribution
  // path a real 57014 would.
  it('fires 57014 and names the query on stderr when a statement exceeds its bound', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    await expect(runStatementTimeoutAttributionProbe()).rejects.toMatchObject({ code: '57014' })

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('[pg-query-failed] annotation=guardStatementTimeoutProbe'),
    )
  })
})
