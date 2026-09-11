import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Topic } from '@/types/topics'
import type { TopicsListResponseBody } from '@/types/api-responses'

const { mockGetPaginatedPage } = vi.hoisted(() => ({
  mockGetPaginatedPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client'), () => ({ getPaginatedPage: mockGetPaginatedPage }))
vi.mock<typeof import('@/test-helpers/infinite-scroll')>(
  import('@/test-helpers/infinite-scroll'),
  async importOriginal => importOriginal(),
)
vi.mock(
  import('@/components/shared/infinite-scroll'),
  () => import('@/test-helpers/infinite-scroll'),
)
vi.mock(
  import('@/components/topics/topic-card'),
  () =>
    ({
      TopicCard: ({ topic }: { topic: { id: string } }) => (
        <div data-testid={`topic-${topic.id}`} />
      ),
    }) as unknown as typeof import('@/components/topics/topic-card'),
)

import { PaginatedUserTopicList } from '../paginated-user-topic-list'

const terminalPageInfo = { has_next_page: false, start_cursor: null, end_cursor: null }

function makeTopic(id: string): Topic {
  return {
    __entity_type: 'topic',
    id,
    name: id,
    slug: id,
    markdown: '',
    aliases: [],
    topic_type: 'card',
    noindex: false,
    allow_reviews: true,
    created_at: '2026-01-01T00:00:00Z',
    logo_image_id: null,
    hero_image_id: null,
    rewards_program_id: null,
    referral_program_id: null,
    created_by: { id: 'user-1', display_name: 'User', display_name_url_id: 'user' },
    updated_by: { id: 'user-1', display_name: 'User', display_name_url_id: 'user' },
  }
}

function makePage(results: Topic[], endCursor: string | null): TopicsListResponseBody {
  return {
    results,
    page_info: endCursor
      ? { has_next_page: true, start_cursor: 'start', end_cursor: endCursor }
      : terminalPageInfo,
  }
}

describe('user relation pagination', () => {
  beforeEach(() => mockGetPaginatedPage.mockReset())

  it('appends and deduplicates topic pages', async () => {
    mockGetPaginatedPage.mockResolvedValue(
      makePage([makeTopic('topic-a'), makeTopic('topic-b')], null),
    )
    render(
      <PaginatedUserTopicList
        initialData={makePage([makeTopic('topic-a')], 'cursor-1')}
        endpoint='/api/v1/users/user-1/topics/following'
        emptyTitle='No topics'
        emptyDescription='Nothing here.'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.getAllByTestId(/^topic-/)).toHaveLength(2))
    expect(mockGetPaginatedPage).toHaveBeenCalledWith('/api/v1/users/user-1/topics/following', {
      after: 'cursor-1',
    })
  })

  it('preserves rows and retries the same cursor after a continuation failure', async () => {
    mockGetPaginatedPage
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(makePage([makeTopic('topic-b')], null))
    render(
      <PaginatedUserTopicList
        initialData={makePage([makeTopic('topic-a')], 'cursor-retry')}
        endpoint='/api/v1/users/user-1/topics/following'
        emptyTitle='No topics'
        emptyDescription='Nothing here.'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible())
    expect(screen.getByTestId('topic-topic-a')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByTestId('topic-topic-b')).toBeVisible())
    expect(mockGetPaginatedPage).toHaveBeenNthCalledWith(
      2,
      '/api/v1/users/user-1/topics/following',
      { after: 'cursor-retry' },
    )
  })
})
