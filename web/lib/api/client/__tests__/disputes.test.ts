import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReviewDispute } from '@/types/review-disputes'
import { reconcileDisputeAIDraft } from '../disputes'

describe('dispute AI draft reads', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads pending and then saved draft through the browser HTTP boundary', async () => {
    const before: ReviewDispute = {
      id: 'dispute-1',
      post_id: 'post-1',
      topic_id: 'topic-1',
      reason: 'privacy_violation',
      status: 'pending',
      post_content: null,
      created_at: '2026-01-01T00:00:00Z',
      ai_drafted_at: null,
      ai_public_response: null,
    }
    const saved: ReviewDispute = {
      ...before,
      ai_drafted_at: '2026-01-02T00:00:00Z',
      ai_public_response: 'Reviewed draft response',
    }
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ dispute: before }))
      .mockResolvedValueOnce(Response.json({ dispute: saved }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await reconcileDisputeAIDraft(before)).toEqual(before)
    expect(await reconcileDisputeAIDraft(before)).toEqual(saved)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/disputes/dispute-1?consistency=primary',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    )
  })
})
