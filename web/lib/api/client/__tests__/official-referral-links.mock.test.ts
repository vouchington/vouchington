import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        delete: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { createOfficialReferralLink, deleteOfficialReferralLink } from '../official-referral-links'
import { clientApi } from '../instance'

const mockDelete = vi.mocked(clientApi.delete)
const mockPost = vi.mocked(clientApi.post)

describe('official-referral-links client', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('POSTs to the correct path for createOfficialReferralLink', async () => {
    mockPost.mockResolvedValueOnce({ official_referral_link: { id: 'link-1' } })

    const result = await createOfficialReferralLink('prog-1', { url: 'https://example.com' })

    expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/referral-programs/prog-1/official-referral-links',
      { url: 'https://example.com' },
    )
    expect(result).toEqual({ official_referral_link: { id: 'link-1' } })
  })

  it('DELETEs the correct path for deleteOfficialReferralLink', async () => {
    mockDelete.mockResolvedValueOnce(undefined)

    await deleteOfficialReferralLink('link-1')

    expect(mockDelete).toHaveBeenCalledWith('/api/v1/official-referral-links/link-1')
  })
})
