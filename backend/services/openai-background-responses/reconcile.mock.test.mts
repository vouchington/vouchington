import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APIError } from 'openai'
import {
  findAiUsageRecordForAgent,
  pollUntilNotNull,
  setBackgroundResponseLeaseExpiresAt,
} from '@voucha/test-helpers'
import type { Response } from 'openai/resources/responses/responses'
import { retrieveOpenAIResponse, cancelOpenAIResponse } from '@modules/openai-utils/create-response'
import { makeSdkResponse, makeSdkTextResponse } from '@modules/openai-utils/test-helpers/responses'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { latchAccountingUncertainty } from '@services/ai-usage'
import { reconcileExpiredBackgroundResponse } from './reconcile.mts'
import { claimAndRecordBackgroundResponseUsage } from './claim-and-record.mts'
import { registerBackgroundResponseLease } from './register.mts'
import { deleteBackgroundResponseRegistration } from './claim.mts'
import { getExpiredBackgroundResponses, type ExpiredBackgroundResponse } from './expired.mts'

function makeUsage(inputTokens: number, outputTokens: number): NonNullable<Response['usage']> {
  return {
    input_tokens: inputTokens,
    input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    output_tokens: outputTokens,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: inputTokens + outputTokens,
  }
}

vi.mock<typeof import('@modules/openai-utils/create-response')>(
  import('@modules/openai-utils/create-response'),
  async importOriginal => ({
    ...(await importOriginal()),
    retrieveOpenAIResponse: vi.fn<VitestLooseMock>(),
    cancelOpenAIResponse: vi.fn<VitestLooseMock>(),
  }),
)

async function registerExpiredRow(): Promise<ExpiredBackgroundResponse> {
  const responseId = `resp_${randomUUID()}`
  await registerBackgroundResponseLease(
    { responseId, agentSlug: `background-sweeper-${randomUUID()}` },
    randomUUID(),
  )
  await setBackgroundResponseLeaseExpiresAt(responseId, '1900-01-01T00:00:00Z')
  const row = (await getExpiredBackgroundResponses({ batchSize: 100 })).find(
    candidate => candidate.responseId === responseId,
  )
  if (!row) throw new Error('expired response lease was not selected')
  return row
}

async function getRegisteredRow(responseId: string): Promise<ExpiredBackgroundResponse | null> {
  await setBackgroundResponseLeaseExpiresAt(responseId, '1900-01-01T00:00:00Z')
  return (
    (await getExpiredBackgroundResponses({ batchSize: 100 })).find(
      row => row.responseId === responseId,
    ) ?? null
  )
}

describe('reconcileExpiredBackgroundResponse', () => {
  beforeEach(() => {
    vi.mocked(retrieveOpenAIResponse).mockReset()
    vi.mocked(cancelOpenAIResponse).mockReset()
  })

  it('claims, records usage, and deletes the registry row for a completed response', async () => {
    const row = await registerExpiredRow()
    vi.mocked(retrieveOpenAIResponse).mockResolvedValueOnce(
      makeSdkTextResponse('done', {
        id: row.responseId,
        model: 'gpt-5.4-nano-2026-03-17',
        service_tier: 'flex',
        usage: makeUsage(321, 654),
      }),
    )

    await expect(reconcileExpiredBackgroundResponse(row)).resolves.toBe('recorded')

    expect(vi.mocked(retrieveOpenAIResponse)).toHaveBeenCalledExactlyOnceWith(row.responseId)
    expect(vi.mocked(cancelOpenAIResponse)).not.toHaveBeenCalled()
    await expect(getRegisteredRow(row.responseId)).resolves.toBeNull()
    const record = await pollUntilNotNull(() =>
      findAiUsageRecordForAgent(row.agentSlug, { inputTokens: 321, outputTokens: 654 }),
    )
    expect(record).toMatchObject({
      model: 'gpt-5.4-nano-2026-03-17',
      service_tier: 'flex',
    })
  })

  it('latches the response request day before settling a ledger failure', async () => {
    const row = await registerExpiredRow()
    vi.mocked(retrieveOpenAIResponse).mockResolvedValueOnce(
      makeSdkTextResponse('done', {
        id: row.responseId,
        model: 'gpt-5.4-nano-2026-03-17',
        service_tier: 'flex',
        usage: makeUsage(321, 654),
      }),
    )
    const claimUsage = vi
      .fn<typeof claimAndRecordBackgroundResponseUsage>()
      .mockRejectedValue(new Error('ledger unavailable'))
    const latchUncertainty = vi.fn<typeof latchAccountingUncertainty>().mockResolvedValue(undefined)

    await expect(
      reconcileExpiredBackgroundResponse(row, {
        claimAndRecordBackgroundResponseUsage: claimUsage,
        latchAccountingUncertainty: latchUncertainty,
      }),
    ).resolves.toBe('accounting-uncertain')

    expect(latchUncertainty).toHaveBeenCalledExactlyOnceWith({
      requestDay: row.createdAt.toISOString().slice(0, 10),
      source: 'ledger_write_failed',
    })
    const retained = await getRegisteredRow(row.responseId)
    if (retained) await deleteBackgroundResponseRegistration(row.responseId, retained.leaseToken)
  })

  it('records usage from a terminal cancelled response', async () => {
    const row = await registerExpiredRow()
    vi.mocked(retrieveOpenAIResponse).mockResolvedValueOnce(
      makeSdkResponse({
        id: row.responseId,
        status: 'cancelled',
        model: 'gpt-5.4-nano-2026-03-17',
        service_tier: 'flex',
        usage: makeUsage(111, 222),
      }),
    )

    await expect(reconcileExpiredBackgroundResponse(row)).resolves.toBe('recorded')
    await expect(getRegisteredRow(row.responseId)).resolves.toBeNull()
  })

  it('deletes an exactly owned completed response that has no billable usage', async () => {
    const row = await registerExpiredRow()
    vi.mocked(retrieveOpenAIResponse).mockResolvedValueOnce(
      makeSdkTextResponse('done', {
        id: row.responseId,
        status: 'completed',
        usage: undefined,
      }),
    )

    await expect(reconcileExpiredBackgroundResponse(row)).resolves.toBe('no-usage')
    await expect(getRegisteredRow(row.responseId)).resolves.toBeNull()
  })

  it('keeps the sweeper-owned row when terminal usage has not settled', async () => {
    const row = await registerExpiredRow()
    vi.mocked(retrieveOpenAIResponse).mockResolvedValueOnce(
      makeSdkResponse({ id: row.responseId, status: 'cancelled', usage: undefined }),
    )

    await expect(reconcileExpiredBackgroundResponse(row)).resolves.toBe('still-active')
    expect(vi.mocked(cancelOpenAIResponse)).not.toHaveBeenCalled()
    const retained = await getRegisteredRow(row.responseId)
    expect(retained?.leaseToken).not.toBe(row.leaseToken)
    if (retained) await deleteBackgroundResponseRegistration(row.responseId, retained.leaseToken)
  })

  it('cancels a still-active response after acquiring the sweeper fence', async () => {
    const row = await registerExpiredRow()
    vi.mocked(retrieveOpenAIResponse).mockResolvedValueOnce(
      makeSdkResponse({ id: row.responseId, status: 'in_progress', usage: undefined }),
    )
    vi.mocked(cancelOpenAIResponse).mockResolvedValueOnce(
      makeSdkResponse({ id: row.responseId, status: 'cancelled', usage: undefined }),
    )

    await expect(reconcileExpiredBackgroundResponse(row)).resolves.toBe('still-active')
    expect(vi.mocked(cancelOpenAIResponse)).toHaveBeenCalledExactlyOnceWith(row.responseId)
    const retained = await getRegisteredRow(row.responseId)
    expect(retained?.leaseToken).not.toBe(row.leaseToken)
    if (retained) await deleteBackgroundResponseRegistration(row.responseId, retained.leaseToken)
  })

  it('deletes the claimed row and reports when retrieve returns 404 past retention', async () => {
    const row = await registerExpiredRow()
    vi.mocked(retrieveOpenAIResponse).mockRejectedValueOnce(
      new APIError(404, {}, 'Not Found', new Headers()),
    )

    await expect(reconcileExpiredBackgroundResponse(row)).resolves.toBe('expired')
    expect(vi.mocked(cancelOpenAIResponse)).not.toHaveBeenCalled()
    await expect(getRegisteredRow(row.responseId)).resolves.toBeNull()
    expect(sentryCaptureExceptionMock).toHaveBeenCalled()
  })

  it('reports a lost race when the claimed row disappears before 404 cleanup', async () => {
    const row = await registerExpiredRow()
    vi.mocked(retrieveOpenAIResponse).mockImplementationOnce(async responseId => {
      const claimed = await getRegisteredRow(responseId)
      if (!claimed) throw new Error('sweeper-owned row was not found')
      await deleteBackgroundResponseRegistration(responseId, claimed.leaseToken)
      throw new APIError(404, {}, 'Not Found', new Headers())
    })

    await expect(reconcileExpiredBackgroundResponse(row)).resolves.toBe('lost-race')
    expect(sentryCaptureExceptionMock).not.toHaveBeenCalled()
  })

  it('does not call OpenAI when the candidate loses the ownership-transfer race', async () => {
    const row: ExpiredBackgroundResponse = {
      responseId: `resp_${randomUUID()}`,
      agentSlug: `background-sweeper-${randomUUID()}`,
      communityId: null,
      postId: null,
      leaseToken: randomUUID(),
      leaseExpiresAt: new Date('1900-01-01T00:00:00Z'),
      createdAt: new Date('1900-01-01T00:00:00Z'),
    }

    await expect(reconcileExpiredBackgroundResponse(row)).resolves.toBe('lost-race')
    expect(vi.mocked(retrieveOpenAIResponse)).not.toHaveBeenCalled()
    expect(vi.mocked(cancelOpenAIResponse)).not.toHaveBeenCalled()
  })

  it('leaves the sweeper-owned row recoverable when retrieve fails', async () => {
    const row = await registerExpiredRow()
    vi.mocked(retrieveOpenAIResponse).mockRejectedValueOnce(
      new APIError(500, {}, 'Internal Server Error', new Headers()),
    )

    await expect(reconcileExpiredBackgroundResponse(row)).rejects.toMatchObject({ status: 500 })

    const retained = await getRegisteredRow(row.responseId)
    expect(retained?.leaseToken).not.toBe(row.leaseToken)
    if (retained) await deleteBackgroundResponseRegistration(row.responseId, retained.leaseToken)
  })
})
