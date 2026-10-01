import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        patch: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import {
  dismissCommunityAutomodFlag,
  recordCommunityAutomodFeedback,
  updateCommunityAutomodSettings,
} from '../community-automod'
import { clientApi } from '../instance'
import { makeCommunity } from '@/test-helpers/api-responses/communities'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'

const mockPatch = vi.mocked(clientApi.patch)
const mockPost = vi.mocked(clientApi.post)

describe('community automod client', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('records community automod feedback with an encoded source key', async () => {
    mockPost.mockResolvedValueOnce({ applied_action: true })

    await expect(
      recordCommunityAutomodFeedback('test-community', 'openai_omni:post/id', {
        outcome: 'false_positive',
        action: 'reinstate',
        reason_code: 'allowed_content',
        note: 'Looks fine after review.',
      }),
    ).resolves.toEqual({ applied_action: true })

    expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/communities/test-community/automod/recent-actions/openai_omni%3Apost%2Fid/feedback',
      {
        outcome: 'false_positive',
        action: 'reinstate',
        reason_code: 'allowed_content',
        note: 'Looks fine after review.',
      },
    )
  })

  it('dismisses an automod flag with encoded community and post ids', async () => {
    mockPost.mockResolvedValueOnce(undefined)

    await expect(dismissCommunityAutomodFlag('my/community', 'post/1')).resolves.toBeUndefined()

    expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/communities/my%2Fcommunity/posts/post%2F1/automod-flag/dismissal',
    )
  })

  it('updates the community automod action with an encoded community id', async () => {
    await expectApiWrapperCall({
      mock: mockPatch,
      response: { community: makeCommunity({ id: 'community-1', automod_action: 'review_queue' }) },
      call: () =>
        updateCommunityAutomodSettings('my/community', { automod_action: 'review_queue' }),
      expectedArgs: [
        '/api/v1/communities/my%2Fcommunity/automod-settings',
        { automod_action: 'review_queue' },
      ],
    })
  })
})
