import { randomUUID } from 'node:crypto'
import { APIError } from 'openai'
import { Responses, type Response } from 'openai/resources/responses/responses'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { countAiUsageRecordsForResponseId } from '@voucha/test-helpers'
import {
  makeSdkResponse,
  makeSdkTextResponse,
} from '@voucha/test-helpers/modules/openai-utils/responses'
import { reconcileBackgroundResponse } from './reconcile.mts'

const retrieve = vi.spyOn(Responses.prototype, 'retrieve')
const cancel = vi.spyOn(Responses.prototype, 'cancel')

function candidate() {
  return {
    responseId: `resp_${randomUUID()}`,
    agentSlug: `provider-state-${randomUUID()}`,
    communityId: null,
    postId: null,
    createdAt: new Date('2023-01-01T12:00:00.000Z'),
  }
}

describe('OpenAI background response recovery states', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'owned-recovery-state-provider-fixture')
    retrieve.mockReset()
    cancel.mockReset()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('cancels a running response, then accounts for usage reported on cancellation', async () => {
    const row = candidate()
    retrieve
      .mockResolvedValueOnce(makeSdkResponse({ id: row.responseId, status: 'in_progress' }))
      .mockResolvedValueOnce(
        makeSdkResponse({ id: row.responseId, status: 'cancelled', model: 'gpt-6-luna' }),
      )
    cancel.mockResolvedValueOnce(makeSdkResponse({ id: row.responseId, status: 'cancelled' }))

    await expect(reconcileBackgroundResponse(row)).resolves.toBe('still-active')
    expect(cancel).toHaveBeenCalledExactlyOnceWith(row.responseId, {
      maxRetries: 0,
      timeout: 10_000,
    })
    await expect(reconcileBackgroundResponse(row)).resolves.toBe('recorded')
    await expect(countAiUsageRecordsForResponseId(row.responseId)).resolves.toBe(1)
    await expect(reconcileBackgroundResponse(row)).resolves.toBe('already-recorded')
  })

  it.each(['failed', 'incomplete', 'cancelled'] as const)(
    'settles a %s response with unknown billed usage',
    async status => {
      const row = candidate()
      retrieve.mockResolvedValueOnce(
        makeSdkResponse({
          id: row.responseId,
          status,
          usage: null as unknown as Response['usage'],
        }),
      )

      await expect(reconcileBackgroundResponse(row)).resolves.toBe('terminal-no-usage')
      expect(cancel).not.toHaveBeenCalled()
      await expect(countAiUsageRecordsForResponseId(row.responseId)).resolves.toBe(0)
    },
  )

  it('settles a completed response without usage without recording a bill', async () => {
    const row = candidate()
    retrieve.mockResolvedValueOnce(
      makeSdkTextResponse('done', { id: row.responseId, usage: undefined }),
    )

    await expect(reconcileBackgroundResponse(row)).resolves.toBe('no-usage')
    await expect(countAiUsageRecordsForResponseId(row.responseId)).resolves.toBe(0)
  })

  it('expires a job-owned response without inventing a usage charge', async () => {
    const row = candidate()
    retrieve.mockRejectedValueOnce(
      APIError.generate(404, { error: { code: 'not_found' } }, 'not found', new Headers()),
    )

    await expect(reconcileBackgroundResponse(row)).resolves.toBe('expired')
    await expect(countAiUsageRecordsForResponseId(row.responseId)).resolves.toBe(0)
  })
})
