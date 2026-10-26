import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  findAiUsageRecordForAgent,
  countBackgroundResponseRegistrations,
} from '@voucha/test-helpers'
import type { Response } from 'openai/resources/responses/responses'
import {
  makeSdkResponse,
  makeSdkTextResponse,
} from '@voucha/test-helpers/modules/openai-utils/responses'
import { retrieveOpenAIResponse, cancelOpenAIResponse } from '@modules/openai-utils/create-response'
import { reconcileBackgroundResponse } from './reconcile.mts'
import { registerBackgroundResponse } from './register.mts'

function makeUsage(): NonNullable<Response['usage']> {
  return {
    input_tokens: 11,
    input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    output_tokens: 7,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: 18,
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

function candidate() {
  return {
    responseId: `resp_${randomUUID()}`,
    agentSlug: `reconcile-${randomUUID()}`,
    communityId: null,
    postId: null,
    createdAt: new Date(),
  }
}

describe('background response reconciliation', () => {
  beforeEach(() => {
    vi.mocked(retrieveOpenAIResponse).mockReset()
    vi.mocked(cancelOpenAIResponse).mockReset()
  })

  it('settles a job-owned response exactly once without a table row', async () => {
    const row = candidate()
    vi.mocked(retrieveOpenAIResponse).mockResolvedValueOnce(
      makeSdkTextResponse('done', {
        id: row.responseId,
        model: 'gpt-6-luna-2026-10-01',
        service_tier: 'flex',
        usage: makeUsage(),
      }),
    )
    await expect(reconcileBackgroundResponse(row, 'job')).resolves.toBe('recorded')
    await expect(reconcileBackgroundResponse(row, 'job')).resolves.toBe('already-recorded')
    await expect(
      findAiUsageRecordForAgent(row.agentSlug, { inputTokens: 11, outputTokens: 7 }),
    ).resolves.not.toBeNull()
    await expect(countBackgroundResponseRegistrations(row.responseId)).resolves.toBe(0)
    expect(retrieveOpenAIResponse).toHaveBeenCalledTimes(1)
  })

  it('settles and deletes an inline response registration', async () => {
    const row = candidate()
    await registerBackgroundResponse(row)
    vi.mocked(retrieveOpenAIResponse).mockResolvedValueOnce(
      makeSdkTextResponse('done', {
        id: row.responseId,
        model: 'gpt-6-luna-2026-10-01',
        service_tier: 'flex',
        usage: makeUsage(),
      }),
    )
    await expect(reconcileBackgroundResponse(row, 'table')).resolves.toBe('recorded')
    await expect(countBackgroundResponseRegistrations(row.responseId)).resolves.toBe(0)
  })

  it('cancels an active response and keeps its inline registration for later usage', async () => {
    const row = candidate()
    await registerBackgroundResponse(row)
    vi.mocked(retrieveOpenAIResponse).mockResolvedValueOnce(
      makeSdkResponse({ id: row.responseId, status: 'in_progress' }),
    )
    vi.mocked(cancelOpenAIResponse).mockResolvedValueOnce(
      makeSdkResponse({ id: row.responseId, status: 'cancelled' }),
    )
    await expect(reconcileBackgroundResponse(row, 'table')).resolves.toBe('still-active')
    await expect(countBackgroundResponseRegistrations(row.responseId)).resolves.toBe(1)
    expect(cancelOpenAIResponse).toHaveBeenCalledExactlyOnceWith(row.responseId)
  })
})
