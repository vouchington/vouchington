import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEntityRelation } from '@/lib/api/client/entity-relations'
import { loadMyCommunities } from '@/lib/api/client/communities'
import { createCommunityPost } from '@/lib/api/client/posts'
import onError from '@/lib/on-error'
import {
  buildDiscussionMarkdown,
  createLinkedCommunityDiscussion,
  linkRelatedUrls,
  loadAvailableCommunities,
} from '../news-community-discussion-helpers'
import { makeCommunity } from '@/test-helpers/api-responses/communities'

vi.mock(import('@/lib/api/client/entity-relations'), () => ({
  createEntityRelation: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/communities'), () => ({
  loadMyCommunities: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/posts'), () => ({
  createCommunityPost: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
}))

const mockCreateEntityRelation = vi.mocked(createEntityRelation)
const mockLoadMyCommunities = vi.mocked(loadMyCommunities)
const mockCreateCommunityPost = vi.mocked(createCommunityPost)
const mockOnError = vi.mocked(onError)

describe('news community discussion helpers', () => {
  beforeEach(() => {
    mockCreateEntityRelation.mockReset()
    mockLoadMyCommunities.mockReset()
    mockCreateCommunityPost.mockReset()
    mockOnError.mockReset()
  })

  it('maps available communities into discussion targets while streaming partial updates', async () => {
    const first = makeCommunity({ name: 'Rewards', slug: 'rewards' })
    const second = makeCommunity({
      id: 'community-2',
      name: 'Private Rewards',
      slug: 'private-rewards',
      visibility: 'private',
      post_approval_required_at: '2026-01-01T00:00:00Z',
    })
    mockLoadMyCommunities.mockImplementation(async (_after, _available, onAvailable) => {
      onAvailable?.([first])
      return [first, second]
    })
    const onAvailable = vi.fn<VitestLooseMock>()

    const result = await loadAvailableCommunities(onAvailable)

    expect(onAvailable).toHaveBeenCalledWith([
      {
        id: 'community-1',
        name: 'Rewards',
        slug: 'rewards',
        visibility: 'public',
        post_approval_required_at: null,
      },
    ])
    expect(result).toEqual([
      {
        id: 'community-1',
        name: 'Rewards',
        slug: 'rewards',
        visibility: 'public',
        post_approval_required_at: null,
      },
      {
        id: 'community-2',
        name: 'Private Rewards',
        slug: 'private-rewards',
        visibility: 'private',
        post_approval_required_at: '2026-01-01T00:00:00Z',
      },
    ])
  })

  it('builds markdown with unique source URLs', () => {
    expect(
      buildDiscussionMarkdown([
        { id: 'url-1', url: 'https://example.com/a' },
        { id: 'url-1', url: 'https://example.com/a' },
        { id: 'url-2', url: 'https://example.com/b' },
      ]),
    ).toBe(
      'Source article:\n\n- [https://example.com/a](https://example.com/a)\n- [https://example.com/b](https://example.com/b)',
    )
    expect(buildDiscussionMarkdown([])).toBe('')
  })

  it('links unique related URLs and reports partial failures', async () => {
    mockCreateEntityRelation
      .mockResolvedValueOnce({
        id: 'relation-1',
        created_at: '2026-01-01T00:00:00Z',
        created_by_id: 'user-1',
        object_data: {},
      })
      .mockRejectedValueOnce(new Error('relation failed'))

    await linkRelatedUrls('post-1', [
      { id: 'url-1', url: 'https://example.com/a' },
      { id: 'url-1', url: 'https://example.com/a' },
      { id: 'url-2', url: 'https://example.com/b' },
    ])

    expect(mockCreateEntityRelation).toHaveBeenCalledTimes(2)
    expect(mockCreateEntityRelation).toHaveBeenNthCalledWith(
      1,
      'post',
      'post-1',
      'related',
      'url',
      'url-1',
    )
    expect(mockOnError).toHaveBeenCalledWith(null, {
      fallback: 'Discussion created, but some article links failed to attach.',
      skipSentry: true,
    })
  })

  it('does not link when no related URLs are provided', async () => {
    await linkRelatedUrls('post-1', [])

    expect(mockCreateEntityRelation).not.toHaveBeenCalled()
  })

  it('createLinkedCommunityDiscussion builds and posts a discussion then links related URLs', async () => {
    const post = {
      id: 'post-1',
      post_type: 'discussion' as const,
      slug: 'discussion-slug',
    }
    mockCreateCommunityPost.mockResolvedValue({
      post,
      community_post_review: null,
    } as unknown as Awaited<ReturnType<typeof createCommunityPost>>)
    mockCreateEntityRelation.mockResolvedValue({
      id: 'relation-1',
      created_at: '2026-01-01T00:00:00Z',
      created_by_id: 'user-1',
      object_data: {},
    })

    const result = await createLinkedCommunityDiscussion(
      { id: 'community-1', name: 'Rewards', slug: 'rewards', visibility: 'public' },
      [{ id: 'url-1', url: 'https://example.com/article' }],
      {
        isPrivateCommunity: false,
        itemTitle: 'My Article',
        recaptchaToken: 'recaptcha',
        turnstileToken: 'turnstile',
      },
    )

    expect(mockCreateCommunityPost).toHaveBeenCalledWith('rewards', {
      community_id: 'community-1',
      post_type: 'discussion',
      title: 'Discuss: My Article',
      markdown: 'Source article:\n\n- [https://example.com/article](https://example.com/article)',
      broadcast: 'everyone',
      privacy: 'public',
      cf_turnstile_response: 'turnstile',
      recaptcha_token: 'recaptcha',
    })
    expect(mockCreateEntityRelation).toHaveBeenCalledWith(
      'post',
      'post-1',
      'related',
      'url',
      'url-1',
    )
    expect(result).toEqual({ post, communityPostReview: null })
  })

  it('createLinkedCommunityDiscussion uses private broadcast/privacy for private communities', async () => {
    mockCreateCommunityPost.mockResolvedValue({
      post: { id: 'post-2', post_type: 'discussion' as const, slug: 'private-discussion' },
      community_post_review: null,
    } as unknown as Awaited<ReturnType<typeof createCommunityPost>>)

    await createLinkedCommunityDiscussion(
      {
        id: 'community-2',
        name: 'Private Rewards',
        slug: 'private-rewards',
        visibility: 'private',
      },
      [],
      {
        isPrivateCommunity: true,
        itemTitle: null,
        recaptchaToken: null,
        turnstileToken: null,
      },
    )

    expect(mockCreateCommunityPost).toHaveBeenCalledWith(
      'private-rewards',
      expect.objectContaining({
        community_id: 'community-2',
        broadcast: 'users',
        privacy: 'private',
        title: 'Community discussion',
      }),
    )
  })
})
