import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
        patch: vi.fn<VitestLooseMock>(),
        delete: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import { unfurlReferralLink } from '../referral-links'

const mockPost = vi.mocked(clientApi.post)

describe('referral-links client', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('unfurlReferralLink', () => {
    it('calls POST to the unfurls sub-resource with an empty body', async () => {
      const resp = {
        referral_link: {
          id: 'link-1',
          parent_link_id: null,
          unfurl_requested_at: '2026-07-23T00:00:00Z',
          unfurl_completed_at: null,
          unfurl_failed_at: null,
          unfurl_last_error: null,
        },
      }
      mockPost.mockResolvedValueOnce(resp)

      const result = await unfurlReferralLink('link-1')

      expect(mockPost).toHaveBeenCalledWith('/api/v1/referral-links/link-1/unfurls', {})
      expect(result).toBe(resp)
    })
  })
})
