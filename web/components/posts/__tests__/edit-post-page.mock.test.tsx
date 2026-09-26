import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

interface HeaderBag {
  get: (key: string) => string | null
}

const {
  mockGetCurrentUser,
  mockGetPost,
  mockGetMyFinancialProfile,
  mockGetCommunity,
  mockGetTopic,
  mockNotFound,
  mockRedirect,
  mockPostForm,
  mockHeaders,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetPost: vi.fn<VitestLooseMock>(),
  mockGetMyFinancialProfile: vi.fn<VitestLooseMock>(),
  mockGetCommunity: vi.fn<VitestLooseMock>(),
  mockGetTopic: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('notFound')
  }),
  mockRedirect: vi.fn<VitestLooseMock>((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
  mockPostForm: vi.fn<VitestLooseMock>(),
  mockHeaders: vi.fn<() => Promise<HeaderBag>>(),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      notFound: mockNotFound,
      redirect: mockRedirect,
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(
  import('next/headers'),
  () => ({ headers: mockHeaders }) as unknown as typeof import('next/headers'),
)
vi.mock(import('@/lib/auth/get-current-user'), () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock(import('@/lib/api/server'), () => ({
  getPost: mockGetPost,
  getMyFinancialProfile: mockGetMyFinancialProfile,
  getCommunity: mockGetCommunity,
  getTopic: mockGetTopic,
}))
vi.mock(import('@/components/posts/post-form'), () => ({
  PostForm: (props: any) => {
    mockPostForm(props)
    return (
      <div
        data-testid='post-form'
        data-initial-topic={JSON.stringify(props.initialDataPointTopic ?? null)}
      />
    )
  },
}))
vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))
vi.mock(
  import('@/components/asides/posts-discovery-aside'),
  () =>
    ({
      PostsDiscoveryAside: () => null,
    }) as unknown as typeof import('@/components/asides/posts-discovery-aside'),
)
vi.mock(import('@/lib/route-configs'), () => ({
  getPostSlugFromType: () => 'data-points',
}))

import { EditPostPage } from '../edit-post-page'

const user = { id: 'user-1', roles: [] as string[] }

function makeDataPointPost(overrides: Record<string, unknown> = {}) {
  return {
    post: {
      id: 'post-1',
      post_type: 'data_point',
      created_by_id: 'user-1',
      community_id: null,
      structured_data: { topic_ids: ['topic-1'], result: 'approved' },
      ...overrides,
    },
  }
}

const cardTopic = {
  topic: {
    id: 'topic-1',
    name: 'Chase Sapphire Preferred',
    topic_type: 'card',
    slug: 'chase-sapphire-preferred',
  },
}

const bankTopic = {
  topic: {
    id: 'topic-2',
    name: 'Chase Total Checking',
    topic_type: 'bank_account',
    slug: 'chase-total-checking',
  },
}

describe('EditPostPage — data_point topic hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUser.mockResolvedValue(user)
    mockGetMyFinancialProfile.mockResolvedValue({ financial_profile: null })
    mockGetCommunity.mockResolvedValue(null)
    mockGetTopic.mockResolvedValue(null)
    mockHeaders.mockResolvedValue({ get: () => null })
  })

  it('passes initialDataPointTopic with credit_card vertical when topic_type is card', async () => {
    mockGetPost.mockResolvedValue(makeDataPointPost())
    mockGetTopic.mockResolvedValue(cardTopic)

    const result = await EditPostPage({ id: 'post-1', postType: 'data_point', title: 'Edit' })
    render(result)

    expect(mockGetTopic).toHaveBeenCalledWith('topic-1')
    const el = screen.getByTestId('post-form')
    const initialTopic = JSON.parse(el.getAttribute('data-initial-topic') ?? 'null')
    expect(initialTopic).toEqual({
      id: 'topic-1',
      name: 'Chase Sapphire Preferred',
      vertical: 'credit_card',
    })
  })

  it('passes initialDataPointTopic with bank_account vertical when topic_type is bank_account', async () => {
    mockGetPost.mockResolvedValue(
      makeDataPointPost({ structured_data: { topic_ids: ['topic-2'], result: 'approved' } }),
    )
    mockGetTopic.mockResolvedValue(bankTopic)

    const result = await EditPostPage({ id: 'post-1', postType: 'data_point', title: 'Edit' })
    render(result)

    const el = screen.getByTestId('post-form')
    const initialTopic = JSON.parse(el.getAttribute('data-initial-topic') ?? 'null')
    expect(initialTopic).toEqual({
      id: 'topic-2',
      name: 'Chase Total Checking',
      vertical: 'bank_account',
    })
  })

  it('omits initialDataPointTopic when getTopic fails', async () => {
    mockGetPost.mockResolvedValue(makeDataPointPost())
    mockGetTopic.mockRejectedValue(new Error('network error'))

    const result = await EditPostPage({ id: 'post-1', postType: 'data_point', title: 'Edit' })
    render(result)

    const el = screen.getByTestId('post-form')
    expect(el.getAttribute('data-initial-topic')).toBe('null')
  })

  it('does not call getTopic when post has no topic_ids', async () => {
    mockGetPost.mockResolvedValue(makeDataPointPost({ structured_data: { result: 'approved' } }))

    const result = await EditPostPage({ id: 'post-1', postType: 'data_point', title: 'Edit' })
    render(result)

    expect(mockGetTopic).not.toHaveBeenCalled()
    const el = screen.getByTestId('post-form')
    expect(el.getAttribute('data-initial-topic')).toBe('null')
  })

  it('does not call getTopic for non-data_point post types', async () => {
    mockGetMyFinancialProfile.mockResolvedValue(null)
    mockGetPost.mockResolvedValue({
      post: {
        id: 'post-2',
        post_type: 'article',
        created_by_id: 'user-1',
        community_id: null,
        structured_data: null,
      },
    })

    const result = await EditPostPage({ id: 'post-2', postType: 'article', title: 'Edit Article' })
    render(result)

    expect(mockGetTopic).not.toHaveBeenCalled()
  })

  it('hydrates topic and hashtag categories when editing a discussion', async () => {
    mockGetMyFinancialProfile.mockResolvedValue(null)
    mockGetPost.mockResolvedValue({
      post: {
        id: 'post-2',
        post_type: 'discussion',
        created_by_id: 'user-1',
        community_id: null,
        structured_data: null,
        post_explicit_categories: [
          { type: 'topic', topic_id: 'topic-1', topic_name: 'Travel' },
          { type: 'hashtag', hashtag: '#Travel.Deals' },
          { type: 'topic', topic_id: 'topic-with-negative-score', topic_name: 'Complete Set' },
        ],
      },
    })

    const result = await EditPostPage({
      id: 'post-2',
      postType: 'discussion',
      title: 'Edit Discussion',
    })
    render(result)

    expect(mockPostForm).toHaveBeenCalledWith(
      expect.objectContaining({
        initialDiscussionCategories: [
          { id: 'topic-1', name: 'Travel' },
          { id: '', name: '', hashtag: '#Travel.Deals' },
          { id: 'topic-with-negative-score', name: 'Complete Set' },
        ],
      }),
    )
  })

  it('blocks official accounts from editing consumer-trust posts', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: ['administrator'] })
    mockGetPost.mockResolvedValue(makeDataPointPost())

    const result = await EditPostPage({ id: 'post-1', postType: 'data_point', title: 'Edit' })
    const { container } = render(result)

    expect(container.querySelector('[data-pw="official-account-edit-post-gate"]')).not.toBeNull()
    expect(screen.queryByTestId('post-form')).toBeNull()
  })
})
