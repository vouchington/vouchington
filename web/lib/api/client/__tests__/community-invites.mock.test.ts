import { afterEach, describe, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: { post: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import { redeemInviteCode, sendInvite } from '../communities'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'
import { makeCommunityInvite } from '@/test-helpers/api-responses/communities'
import type { CreatedCommunityInvite } from '@/types/api-responses'

const invite = makeCommunityInvite({ invited_user_id: 'recipient-id', invited_email: null })

describe('community invitation client', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('posts the recipient and returns the separate one-time creation response', async () => {
    const createdInvite: CreatedCommunityInvite = { ...invite, code: 'fresh-code' }

    await expectApiWrapperCall({
      mock: vi.mocked(clientApi.post),
      response: { community_invite: createdInvite },
      call: () => sendInvite('community-slug', { username: 'recipient' }),
      expectedArgs: ['/api/v1/communities/community-slug/invites', { username: 'recipient' }],
    })
  })

  it('posts a redemption code and returns invite metadata', async () => {
    await expectApiWrapperCall({
      mock: vi.mocked(clientApi.post),
      response: { community_invite: invite },
      call: () => redeemInviteCode('fresh-code'),
      expectedArgs: ['/api/v1/communities/invite-redemptions', { code: 'fresh-code' }],
    })
  })
})
