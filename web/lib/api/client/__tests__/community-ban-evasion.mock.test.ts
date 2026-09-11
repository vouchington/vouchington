import { describe, it, expect, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        post: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
        delete: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
      },
    }) as unknown as typeof import('../instance'),
)

import { confirmCommunityBanEvasion, dismissCommunityBanEvasion } from '../community-ban-evasion'
import { clientApi } from '../instance'

describe('community-ban-evasion client API', () => {
  it('calls POST for confirmCommunityBanEvasion', async () => {
    await confirmCommunityBanEvasion('my/community', 'user/123')
    expect(clientApi.post).toHaveBeenCalledWith(
      '/api/v1/communities/my%2Fcommunity/ban-evasion/user%2F123',
    )
  })

  it('calls DELETE for dismissCommunityBanEvasion', async () => {
    await dismissCommunityBanEvasion('my/community', 'user/456')
    expect(clientApi.delete).toHaveBeenCalledWith(
      '/api/v1/communities/my%2Fcommunity/ban-evasion/user%2F456',
    )
  })
})
