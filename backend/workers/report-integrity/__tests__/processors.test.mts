import { describe, expect, it } from 'vitest'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import type { ProcessReportIntegrityCheckData } from '@queues/report-integrity/types'
import { processReportIntegrityCheck } from '../processors.mts'

describe('report integrity worker failures', () => {
  it('reports and rethrows the same database error so the queue can retry', async () => {
    const data: ProcessReportIntegrityCheckData = {
      entityType: 'user',
      entityId: 'not-a-uuid',
    }

    const failure: unknown = await processReportIntegrityCheck(data).catch((err: unknown) => err)

    expect(failure).toBeInstanceOf(Error)
    expect(failure).toMatchObject({ code: '22P02' })
    expect(sentryCaptureExceptionMock.mock.calls.some(([captured]) => captured === failure)).toBe(
      true,
    )
  })
})
