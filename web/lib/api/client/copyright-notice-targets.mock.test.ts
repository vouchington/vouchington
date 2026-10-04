import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  makeCopyrightHostedCommunityResponse,
  makeCopyrightHostedTopicResponse,
} from '@/test-helpers/api-responses/copyright'
import {
  resolveCopyrightNoticeTargets,
  copyrightNoticeTargetKey,
  copyrightNoticeTargetInput,
  type CopyrightNoticeResolvedTarget,
} from './copyright-notice-targets'

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn<VitestLooseMock>() }))
vi.mock(
  import('./instance'),
  () => ({ clientApi: { get: mockGet } }) as unknown as typeof import('./instance'),
)

const image = (image_id: string) => ({
  placement_id: `placement-${image_id}`,
  placement_revision: 1,
  image_id,
})

describe('resolveCopyrightNoticeTargets', () => {
  beforeEach(() => mockGet.mockReset())
  it('lists a profile image and a linked image under their distinct owner IDs', async () => {
    mockGet.mockResolvedValue({
      user: { id: 'user-1', profile_image_placement: image('same-image') },
      profile_links: [
        {
          id: 'link-1',
          user_id: 'user-1',
          name: 'Portfolio',
          image_placement: image('same-image'),
        },
      ],
    })
    const targets = await resolveCopyrightNoticeTargets('https://voucha.ai/user/alice')
    expect(mockGet).toHaveBeenCalledWith('/api/v1/users/alice')
    expect(targets).toEqual([
      expect.objectContaining({
        surface: 'user-profile-image',
        user_id: 'user-1',
        image_id: 'same-image',
        caption: 'Profile image',
      }),
      expect.objectContaining({
        surface: 'user-profile-link-image',
        user_profile_link_id: 'link-1',
        image_id: 'same-image',
        caption: 'Profile link image: Portfolio',
      }),
    ])
    expect(new Set(targets.map(copyrightNoticeTargetKey)).size).toBe(2)
  })

  it('lists topic logo and hero as distinct choices on one URL', async () => {
    mockGet.mockResolvedValue(
      makeCopyrightHostedTopicResponse({
        id: 'topic-1',
        topicType: 'topic',
        logo: image('same-image'),
        hero: image('same-image'),
      }),
    )
    const targets = await resolveCopyrightNoticeTargets('https://voucha.ai/topic/cameras')
    expect(mockGet).toHaveBeenCalledWith('/api/v1/topics/cameras')
    expect(targets.map(target => target.surface)).toEqual(['topic-logo-image', 'topic-hero-image'])
    expect(new Set(targets.map(copyrightNoticeTargetKey)).size).toBe(2)
  })

  it('lists community profile and banner placements', async () => {
    mockGet.mockResolvedValue(
      makeCopyrightHostedCommunityResponse({
        id: 'community-1',
        profile: image('profile'),
        banner: image('banner'),
      }),
    )
    const targets = await resolveCopyrightNoticeTargets('https://voucha.ai/communities/photo-club')
    expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/photo-club')
    expect(targets.map(target => target.surface)).toEqual([
      'community-profile-image',
      'community-banner-image',
    ])
  })

  it('keeps the post image route and refuses unsupported or empty pages', async () => {
    mockGet.mockResolvedValueOnce({ post: { id: 'post-1' } }).mockResolvedValueOnce({
      images: [{ image_id: 'image-1', order_index: 0, caption: 'Photo' }],
    })
    await expect(
      resolveCopyrightNoticeTargets('https://voucha.ai/discussion/photo'),
    ).resolves.toEqual([
      {
        surface: 'post-image',
        post_id: 'post-1',
        image_id: 'image-1',
        target_url: 'https://voucha.ai/discussion/photo',
        order_index: 0,
        caption: 'Photo',
      },
    ])
    await expect(
      resolveCopyrightNoticeTargets('https://voucha.ai/unrelated/photo'),
    ).rejects.toThrow('supported Voucha page')
    mockGet.mockResolvedValue({
      user: { id: 'user-1', profile_image_placement: null },
      profile_links: [],
    })
    await expect(resolveCopyrightNoticeTargets('https://voucha.ai/user/alice')).rejects.toThrow(
      'available images',
    )
  })
  it('rejects a topic URL whose returned topic type differs', async () => {
    mockGet.mockResolvedValue(
      makeCopyrightHostedTopicResponse({
        id: 'topic-1',
        topicType: 'category',
        logo: image('logo'),
        hero: null,
      }),
    )
    await expect(resolveCopyrightNoticeTargets('https://voucha.ai/topic/cameras')).rejects.toThrow(
      'This topic URL is unavailable.',
    )
  })

  it.each([
    [{ surface: 'post-image', post_id: 'post-1' }, 'post-image:post-1:image-1'],
    [{ surface: 'user-profile-image', user_id: 'user-1' }, 'user-profile-image:user-1:image-1'],
    [
      { surface: 'user-profile-link-image', user_profile_link_id: 'link-1' },
      'user-profile-link-image:link-1:image-1',
    ],
    [{ surface: 'topic-logo-image', topic_id: 'topic-1' }, 'topic-logo-image:topic-1:image-1'],
    [{ surface: 'topic-hero-image', topic_id: 'topic-1' }, 'topic-hero-image:topic-1:image-1'],
    [
      { surface: 'community-profile-image', community_id: 'community-1' },
      'community-profile-image:community-1:image-1',
    ],
    [
      { surface: 'community-banner-image', community_id: 'community-1' },
      'community-banner-image:community-1:image-1',
    ],
  ] as const)('uses the selected %s owner for the request and slot key', (owner, key) => {
    const target = {
      ...owner,
      image_id: 'image-1',
      target_url: 'https://voucha.ai/discussion/one',
      order_index: 0,
      caption: 'Chosen image',
    } as CopyrightNoticeResolvedTarget
    expect(copyrightNoticeTargetKey(target)).toBe(key)
    expect(copyrightNoticeTargetInput(target)).toEqual({
      ...owner,
      image_id: 'image-1',
      target_url: target.target_url,
    })
  })
})
