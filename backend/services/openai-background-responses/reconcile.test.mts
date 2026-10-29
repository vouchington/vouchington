import { randomUUID } from 'node:crypto'
import { APIError } from 'openai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { countAiUsageRecordsForAgent } from '@voucha/test-helpers'
import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import {
  makeSdkResponse,
  makeSdkTextResponse,
} from '@voucha/test-helpers/modules/openai-utils/responses'
import { Responses, type Response } from 'openai/resources/responses/responses'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import { reconcileBackgroundResponse } from './reconcile.mts'

function makeUsage(inputTokens = 11): NonNullable<Response['usage']> {
  return {
    input_tokens: inputTokens,
    input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    output_tokens: 7,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: inputTokens + 7,
  }
}

const retrieve = vi.spyOn(Responses.prototype, 'retrieve')
const cancel = vi.spyOn(Responses.prototype, 'cancel')

function candidate() {
  return {
    responseId: `resp_${randomUUID()}`,
    agentSlug: `reconcile-${randomUUID()}`,
    communityId: null,
    postId: null,
    createdAt: new Date(),
  }
}

describe('saved background response reconciliation', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'owned-recovery-provider-fixture')
    retrieve.mockReset()
    cancel.mockReset()
    cancel.mockResolvedValue(makeSdkResponse({ status: 'cancelled' }))
    sentryCaptureExceptionMock.mockClear()
  })

  it.each([
    ['completed', makeSdkTextResponse],
    [
      'cancelled',
      (_text: string, over: Partial<Response>) => makeSdkResponse({ ...over, status: 'cancelled' }),
    ],
  ] as const)('records the usage of a %s response', async (_status, make) =>
    withReservedAiUsageDay(1_000_000, async () => {
      const row = candidate()
      retrieve.mockResolvedValueOnce(make('done', { id: row.responseId, usage: makeUsage() }))
      await expect(reconcileBackgroundResponse(row, 'worker')).resolves.toBe('settled')
      await expect(
        countAiUsageRecordsForAgent(row.agentSlug, { inputTokens: 11, outputTokens: 7 }),
      ).resolves.toBe(1)
      expect(cancel).not.toHaveBeenCalled()
    }),
  )

  it('settles a terminal response without usage and records nothing', async () => {
    const row = candidate()
    retrieve.mockResolvedValueOnce(
      makeSdkResponse({
        id: row.responseId,
        status: 'failed',
        usage: null as unknown as Response['usage'],
      }),
    )
    await expect(reconcileBackgroundResponse(row, 'worker')).resolves.toBe('settled')
    await expect(
      countAiUsageRecordsForAgent(row.agentSlug, { inputTokens: 11, outputTokens: 7 }),
    ).resolves.toBe(0)
  })

  it('settles a response past provider retention', async () => {
    const row = candidate()
    retrieve.mockRejectedValueOnce(
      APIError.generate(404, { error: { code: 'not_found' } }, 'not found', new Headers()),
    )
    await expect(reconcileBackgroundResponse(row, 'worker')).resolves.toBe('settled')
  })

  it('cancels a running response for a replaying worker', async () => {
    const row = candidate()
    retrieve.mockResolvedValueOnce(makeSdkResponse({ id: row.responseId, status: 'in_progress' }))
    await expect(reconcileBackgroundResponse(row, 'worker')).resolves.toBe('settled')
    expect(cancel).toHaveBeenCalledExactlyOnceWith(row.responseId, expect.anything())
  })

  it('leaves a running response alone for an inline call recovery job', async () => {
    const row = candidate()
    retrieve.mockResolvedValueOnce(makeSdkResponse({ id: row.responseId, status: 'in_progress' }))
    await expect(reconcileBackgroundResponse(row, 'inline')).resolves.toBe('still-active')
    expect(cancel).not.toHaveBeenCalled()
  })

  it('reports an unwritable usage record and moves on', async () => {
    const row = candidate()
    retrieve.mockResolvedValueOnce(
      makeSdkTextResponse('done', { id: row.responseId, usage: makeUsage(2 ** 31) }),
    )
    await expect(reconcileBackgroundResponse(row, 'worker')).resolves.toBe('settled')
    expect(sentryCaptureExceptionMock).toHaveBeenCalledOnce()
    await expect(countAiUsageRecordsForAgent(row.agentSlug)).resolves.toBe(0)
  })

  it('lets a failed retrieval retry the job', async () => {
    const failure = new Error('provider unavailable')
    retrieve.mockRejectedValueOnce(failure)
    await expect(reconcileBackgroundResponse(candidate(), 'worker')).rejects.toBe(failure)
  })
})
