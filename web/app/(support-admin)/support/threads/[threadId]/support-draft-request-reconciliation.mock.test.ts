import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/error'
import { pollForSupportDraft } from '@/lib/api/client/support-draft-polling'
import type { SupportMessagesResponse } from '@/types/support'
import { requestSupportDraftWithReconciliation } from './support-draft-request-reconciliation'

vi.mock(import('@/lib/api/client/support-draft-polling'), () => ({
  pollForSupportDraft: vi.fn<VitestLooseMock>(),
}))

const page = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

describe('requestSupportDraftWithReconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reconciles a ClientRequest-wrapped transport failure', async () => {
    vi.mocked(pollForSupportDraft).mockResolvedValueOnce(page as SupportMessagesResponse)
    const requestError = new ApiError(
      'Network disconnected',
      500,
      new Error('Network disconnected'),
    )
    const requestDraft = vi.fn<() => Promise<void>>().mockRejectedValueOnce(requestError)

    await expect(
      requestSupportDraftWithReconciliation({
        existingMessageIds: new Set(['existing']),
        fetchMessages: vi.fn<() => Promise<SupportMessagesResponse>>(),
        requestDraft,
      }),
    ).resolves.toBe(page)
    expect(pollForSupportDraft).toHaveBeenCalledOnce()
  })

  it('does not reconcile a definite HTTP response failure', async () => {
    const requestError = new ApiError('Thread resolved', 409, { message: 'Thread resolved' })

    await expect(
      requestSupportDraftWithReconciliation({
        existingMessageIds: new Set(),
        fetchMessages: vi.fn<() => Promise<SupportMessagesResponse>>(),
        requestDraft: async () => {
          throw requestError
        },
      }),
    ).rejects.toBe(requestError)
    expect(pollForSupportDraft).not.toHaveBeenCalled()
  })
})
