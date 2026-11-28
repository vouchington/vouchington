import '@/test-helpers/i18n/mock-json-messages'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import PostFollowContext from '@/components/posts/post-follow-context'
import RssFeedItemFollowContext from '@/components/rss-feed-items/rss-feed-item-follow-context'
import TopicFollowContext from '@/components/topics/topic-follow-context'
import type {
  EntityFollowContextResponseBody,
  FollowContextUsers,
  TopicFollowContextResponseBody,
  TopicFollowerContext,
} from '@/types/api-responses'
import type { PublicUser, User } from '@/types/user'

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
const fetchTopicFollowContext = vi.hoisted(() =>
  vi.fn<(id: string, after: string) => Promise<TopicFollowContextResponseBody>>(),
)
vi.mock(import('@/lib/api/client/topics'), async importOriginal => ({
  ...(await importOriginal()),
  fetchTopicFollowContext,
}))

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

    expect(screen.getByText('Positive signals for this post')).toBeInTheDocument()
    expect(screen.getByText('Negative signals for this post')).toBeInTheDocument()
  })

  it('labels topic sign buckets as positive and negative signals', async () => {
    getCurrentUser.mockResolvedValue(currentUser)
    getTopicFollowContext.mockResolvedValue({
      positive_by_following: positiveSignals,
      negative_by_following: noSignals,
      following_topic_followers: { ...noSignals, total_is_exact: true, next_cursor: null },
    })

    await renderRsc(TopicFollowContext({ id: 'topic-1' }))

    expect(screen.getByText('Positive signals for this topic')).toBeInTheDocument()
    expect(screen.getByText('Negative signals for this topic')).toBeInTheDocument()
  })

  it('hides an empty topic follow context from a legacy response', async () => {
    getCurrentUser.mockResolvedValue(currentUser)
    getTopicFollowContext.mockResolvedValue(topicPage(noSignals))

    const { container } = await renderRsc(TopicFollowContext({ id: 'topic-legacy-empty' }))

    expect(container).toBeEmptyDOMElement()
  })

  it('renders an exact topic follower count for a legacy response without pagination metadata', async () => {
    getCurrentUser.mockResolvedValue(currentUser)
    getTopicFollowContext.mockResolvedValue(topicPage({ total: 3, users: [follower('mira')] }))
    fetchTopicFollowContext.mockReset()

    await renderRsc(TopicFollowContext({ id: 'topic-legacy' }))

    expect(screen.getByRole('link', { name: 'mira' })).toBeVisible()
    expect(screen.getByText('3')).toBeVisible()
    expect(screen.getByText('and 2 more')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Keep looking' })).toBeNull()
    expect(fetchTopicFollowContext).not.toHaveBeenCalled()
  })

  it('continues past an empty topic preview and stops when the next response omits a cursor', async () => {
    getCurrentUser.mockResolvedValue(currentUser)
    getTopicFollowContext.mockResolvedValue(
      topicPage({ total: 0, users: [], total_is_exact: false, next_cursor: 'opaque-partial' }),
    )
    fetchTopicFollowContext.mockReset()
    fetchTopicFollowContext
      .mockResolvedValueOnce(
        topicPage({ total: 0, users: [], total_is_exact: false, next_cursor: 'opaque-empty' }),
      )
      .mockResolvedValueOnce(
        topicPage({ total: 1, users: [follower('mira')], total_is_exact: false }),
      )

    await renderRsc(TopicFollowContext({ id: 'topic-1' }))

    const continueButton = screen.getByRole('button', { name: 'Keep looking' })
    expect(screen.getByText('No matches yet.')).toBeVisible()
    expect(screen.queryByText('0+')).toBeNull()
    expect(fetchTopicFollowContext).not.toHaveBeenCalled()
    fireEvent.click(continueButton)
    fireEvent.click(await screen.findByRole('button', { name: 'Keep looking' }))

    expect(await screen.findByRole('link', { name: 'mira' })).toBeVisible()
    expect(screen.getByText('1+')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Keep looking' })).toBeNull()
    expect(fetchTopicFollowContext.mock.calls).toEqual([
      ['topic-1', 'opaque-partial'],
      ['topic-1', 'opaque-empty'],
    ])
  })

  it('retries a failed topic continuation with the same cursor', async () => {
    getCurrentUser.mockResolvedValue(currentUser)
    getTopicFollowContext.mockResolvedValue(
      topicPage({ total: 0, users: [], total_is_exact: false, next_cursor: 'opaque-retry' }),
    )
    fetchTopicFollowContext.mockReset()
    fetchTopicFollowContext
      .mockRejectedValueOnce(new Error('Could not fetch the next page'))
      .mockResolvedValueOnce(
        topicPage({ total: 1, users: [follower('mira')], total_is_exact: true, next_cursor: null }),
      )

    await renderRsc(TopicFollowContext({ id: 'topic-3' }))

    fireEvent.click(screen.getByRole('button', { name: 'Keep looking' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('link', { name: 'mira' })).toBeVisible()
    expect(fetchTopicFollowContext.mock.calls).toEqual([
      ['topic-3', 'opaque-retry'],
      ['topic-3', 'opaque-retry'],
    ])
  })

  it('uses a lower bound across suffixes and preserves the topic follower preview size', async () => {
    getCurrentUser.mockResolvedValue(currentUser)
    getTopicFollowContext.mockResolvedValue(
      topicPage({
        total: 12,
        users: [follower('mira')],
        total_is_exact: false,
        next_cursor: 'opaque-partial',
      }),
    )
    fetchTopicFollowContext.mockReset()
    fetchTopicFollowContext.mockResolvedValueOnce(
      topicPage({
        total: 9,
        users: ['mira', 'lucia', 'mali', 'ines', 'vera'].map(follower),
        total_is_exact: false,
        next_cursor: 'opaque-unused',
      }),
    )

    await renderRsc(TopicFollowContext({ id: 'topic-2' }))

    fireEvent.click(screen.getByRole('button', { name: 'Keep looking' }))

    expect(await screen.findByRole('link', { name: 'vera' })).toBeVisible()
    expect(screen.getAllByRole('link')).toHaveLength(5)
    expect(screen.getByText('12+')).toBeVisible()
    expect(screen.queryByText('21+')).toBeNull()
    expect(screen.queryByText(/and .* more/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Keep looking' })).toBeNull()
  })

  it('labels RSS item sign buckets as positive and negative signals', async () => {
    getCurrentUser.mockResolvedValue(currentUser)
    getRssFeedItemFollowContext.mockResolvedValue({
      positive_by_following: positiveSignals,
      negative_by_following: noSignals,
    })

    await renderRsc(RssFeedItemFollowContext({ id: 'item-1' }))

    expect(screen.getByText('Positive signals for this item')).toBeInTheDocument()
    expect(screen.getByText('Negative signals for this item')).toBeInTheDocument()
  })
})

function topicPage(followers: TopicFollowerContext): TopicFollowContextResponseBody {
  return {
    positive_by_following: noSignals,
    negative_by_following: noSignals,
    following_topic_followers: followers,
  }
}

function follower(username: string): PublicUser {
  return { id: username, username, account_type: null }
}
