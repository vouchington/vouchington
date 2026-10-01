import { describe, expect, it } from 'vitest'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { getPartitionStatus } from '../partitions.mts'

describe('partition catalog failure', () => {
  it('reports and preserves a partition catalog query failure', async () => {
    const { result, error } = await withPostgresPoolQueryFailureForTest(
      '/* getPartitionStatus */',
      () => getPartitionStatus().catch((err: unknown) => err),
    )

    expect(error).toMatchObject({ code: '25P02' })
    expect(result).toBe(error)
    expect(sentryCaptureExceptionMock.mock.calls.some(([captured]) => captured === error)).toBe(
      true,
    )
    await expect(getPartitionStatus()).resolves.toHaveProperty('tables')
  })
})
