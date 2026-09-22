import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: { get: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import { resolveCopyrightNoticeTargets } from '../copyright-notice-targets'

const mockGet = vi.mocked(clientApi.get)

describe('resolveCopyrightNoticeTargets', () => {
  afterEach(() => vi.clearAllMocks())

  it('resolves a canonical Voucha post URL into hosted image choices', async () => {
    mockGet.mockResolvedValueOnce({ post: { id: 'post-1' } }).mockResolvedValueOnce({
      images: [{ image_id: 'image-1', order_index: 0, caption: 'Photo' }],
    })
    await expect(
      resolveCopyrightNoticeTargets('https://voucha.ai/discussion/hosted-material'),
    ).resolves.toEqual([
      {
        post_id: 'post-1',
        image_id: 'image-1',
        target_url: 'https://voucha.ai/discussion/hosted-material',
        order_index: 0,
        caption: 'Photo',
      },
    ])
    expect(mockGet).toHaveBeenCalledWith('/api/v1/posts/hosted-material')
    expect(mockGet).toHaveBeenCalledWith('/api/v1/posts/hosted-material/images')
  })

  it('resolves a canonical Voucha story URL into hosted image choices', async () => {
    mockGet.mockResolvedValueOnce({ post: { id: 'story-1' } }).mockResolvedValueOnce({
      images: [{ image_id: 'image-1', order_index: 0, caption: 'Photo' }],
    })
    await expect(
      resolveCopyrightNoticeTargets('https://voucha.ai/story/hosted-material'),
    ).resolves.toEqual([
      {
        post_id: 'story-1',
        image_id: 'image-1',
        target_url: 'https://voucha.ai/story/hosted-material',
        order_index: 0,
        caption: 'Photo',
      },
    ])
    expect(mockGet).toHaveBeenCalledWith('/api/v1/posts/hosted-material')
    expect(mockGet).toHaveBeenCalledWith('/api/v1/posts/hosted-material/images')
  })

  it('rejects incomplete, foreign, and empty hosted-use URLs', async () => {
    await expect(resolveCopyrightNoticeTargets('not a url')).rejects.toThrow(
      'Enter the full URL of the Voucha post containing the material.',
    )
    await expect(
      resolveCopyrightNoticeTargets('https://example.test/discussion/hosted-material'),
    ).rejects.toThrow('Enter a canonical Voucha post URL without a query or fragment.')
    await expect(
      resolveCopyrightNoticeTargets('https://voucha.ai/discussion/hosted-material?ref=1'),
    ).rejects.toThrow('Enter a canonical Voucha post URL without a query or fragment.')
    await expect(
      resolveCopyrightNoticeTargets('https://voucha.ai/communities/slug'),
    ).rejects.toThrow('Enter the URL of a supported Voucha post.')
    await expect(
      resolveCopyrightNoticeTargets('https://voucha.ai/discussion/foo%5Cbar'),
    ).rejects.toThrow('Enter the URL of a supported Voucha post.')
    mockGet.mockResolvedValueOnce({ post: { id: 'post-1' } }).mockResolvedValueOnce({ images: [] })
    await expect(
      resolveCopyrightNoticeTargets('https://voucha.ai/article/empty-post'),
    ).rejects.toThrow('This hosted use does not have any available images.')
  })
})
