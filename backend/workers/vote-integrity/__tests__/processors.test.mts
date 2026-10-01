import { describe, expect, it } from 'vitest'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { randomUUID } from 'node:crypto'
import type { ProcessVoteIntegrityCheckData } from '@queues/vote-integrity/types'
import { processVoteIntegrityCheck } from '../processors.mts'

describe('vote integrity worker failures', () => {
  it('reports and rethrows the same database error so the queue can retry', async () => {
    const data: ProcessVoteIntegrityCheckData = {
      entityType: 'post',
      entityId: 'not-a-uuid',
      userId: randomUUID(),
      ipAddress: null,
      score: 1,
    }

    const failure: unknown = await processVoteIntegrityCheck(data).catch((err: unknown) => err)

    expect(failure).toBeInstanceOf(Error)
    expect(failure).toMatchObject({ code: '22P02' })
    expect(sentryCaptureExceptionMock.mock.calls.some(([captured]) => captured === failure)).toBe(
      true,
    )
  })
})
