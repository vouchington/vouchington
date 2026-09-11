import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PostFollowContext from '@/components/posts/post-follow-context'
import RssFeedItemFollowContext from '@/components/rss-feed-items/rss-feed-item-follow-context'
import TopicFollowContext from '@/components/topics/topic-follow-context'
import type {
  EntityFollowContextResponseBody,
  FollowContextUsers,
  TopicFollowContextResponseBody,
} from '@/types/api-responses'
import type { User } from '@/types/user'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href }: { children: ReactNode; href: string }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)

const getCurrentUser = vi.fn<() => Promise<User | null>>()
const getPostFollowContext =
  vi.fn<(id: string) => Promise<EntityFollowContextResponseBody | null>>()
const getRssFeedItemFollowContext =
  vi.fn<(id: string) => Promise<EntityFollowContextResponseBody | null>>()
const getTopicFollowContext = vi.fn<(id: string) => Promise<TopicFollowContextResponseBody>>()
const headersMock = vi.fn<() => Promise<{ get: (name: string) => string | null }>>(async () => ({
  get: () => null,
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: () => getCurrentUser(),
}))

vi.mock(
  import('next/headers'),
  () =>
    ({
      headers: () => headersMock(),
    }) as unknown as typeof import('next/headers'),
)

vi.mock(import('@/lib/api/server'), () => ({
  getPostFollowContext: (id: string) => getPostFollowContext(id),
  getRssFeedItemFollowContext: (id: string) => getRssFeedItemFollowContext(id),
  getTopicFollowContext: (id: string) => getTopicFollowContext(id),
}))

const currentUser = { id: 'me', username: 'me' } as User
const positiveSignals: FollowContextUsers = { total: 1, users: [] }
const noSignals: FollowContextUsers = { total: 0, users: [] }

async function renderRsc(node: Promise<ReactNode>) {
  return render(await node)
}

describe('entity follow context', () => {
  it('labels post sign buckets as positive and negative signals', async () => {
    getCurrentUser.mockResolvedValue(currentUser)
    getPostFollowContext.mockResolvedValue({
      positive_by_following: positiveSignals,
      negative_by_following: noSignals,
    })

    await renderRsc(PostFollowContext({ id: 'post-1' }))

    expect(screen.getByText('Positive signals for this post')).toBeDefined()
    expect(screen.getByText('Negative signals for this post')).toBeDefined()
  })

  it('labels topic sign buckets as positive and negative signals', async () => {
    getCurrentUser.mockResolvedValue(currentUser)
    getTopicFollowContext.mockResolvedValue({
      positive_by_following: positiveSignals,
      negative_by_following: noSignals,
      following_topic_followers: noSignals,
    })

    await renderRsc(TopicFollowContext({ id: 'topic-1' }))

    expect(screen.getByText('Positive signals for this topic')).toBeDefined()
    expect(screen.getByText('Negative signals for this topic')).toBeDefined()
  })

  it('labels RSS item sign buckets as positive and negative signals', async () => {
    getCurrentUser.mockResolvedValue(currentUser)
    getRssFeedItemFollowContext.mockResolvedValue({
      positive_by_following: positiveSignals,
      negative_by_following: noSignals,
    })

    await renderRsc(RssFeedItemFollowContext({ id: 'item-1' }))

    expect(screen.getByText('Positive signals for this item')).toBeDefined()
    expect(screen.getByText('Negative signals for this item')).toBeDefined()
  })
})
