import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        post: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { recordCommunityAutomodFeedback } from '../community-automod'
import { clientApi } from '../instance'

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
})
