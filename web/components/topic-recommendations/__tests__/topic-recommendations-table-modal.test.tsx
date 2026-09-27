import {
  makeRecommendationTableFixture,
  mockNav,
  mockOnError,
  mockOnSuccess,
  mockReject,
  tableAuth,
} from '@/test-helpers/components/topic-recommendations/topic-recommendations-table.mock-support'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicRecommendationsTable } from '../topic-recommendations-table'
import type { PostsResponseBody } from '@/types/api-responses'
import type { User } from '@/types/user'

const { basePost, data } = makeRecommendationTableFixture()
const mockRouterRefresh = mockNav.refresh

describe('TopicRecommendationsTable — modal actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tableAuth.currentUser = { id: 'user-1', roles: [] } as User
  })

  function renderTable({
    currentUserId = 'user-1',
    isAdmin = false,
    tableData = data,
  }: {
    currentUserId?: string
    isAdmin?: boolean
    tableData?: PostsResponseBody
  } = {}) {
    tableAuth.currentUser = { id: currentUserId, roles: [] } as User
    return render(
      <TopicRecommendationsTable
        data={tableData}
        isAdmin={isAdmin}
      />,
    )
  }

  it('rejects from the modal dialog and navigates to next pending post', async () => {
    mockReject.mockResolvedValue({ post: basePost })

    const rec2post = {
      ...basePost,
      id: 'rec-2',
      topic_recommendation: {
        ...basePost.topic_recommendation,
        post_id: 'rec-2',
        topic_title: 'Second Topic',
        topic_slug: 'second-topic',
        status: 'pending' as const,
      },
    }
    const twoItemData: PostsResponseBody = {
      ...data,
      results: [
        { __entity_type: 'post', id: 'rec-1', ranking: 1, search_vector_ts: null },
        { __entity_type: 'post', id: 'rec-2', ranking: 2, search_vector_ts: null },
      ],
      posts: { 'rec-1': basePost, 'rec-2': rec2post },
      markdown_to_html: { 'rec-1': '<p>Rationale 1</p>', 'rec-2': '<p>Rationale 2</p>' },
    }

    renderTable({ isAdmin: true, tableData: twoItemData })

    fireEvent.click(screen.getByRole('button', { name: 'Proposed Topic' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Reject/ }))

    await waitFor(() => {
      expect(mockReject).toHaveBeenCalledWith('rec-1', undefined)
    })
    expect(mockOnSuccess).toHaveBeenCalledWith('Recommendation rejected')
    expect(mockRouterRefresh).toHaveBeenCalled()
    await waitFor(() => {
      expect(
        within(screen.getByRole('dialog')).getAllByText('Second Topic').length,
      ).toBeGreaterThan(0)
    })
  })

  it('rejects from the modal dialog and closes when no next pending post', async () => {
    mockReject.mockResolvedValue({ post: basePost })

    renderTable({ isAdmin: true })

    fireEvent.click(screen.getByRole('button', { name: 'Proposed Topic' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Reject/ }))

    await waitFor(() => {
      expect(mockReject).toHaveBeenCalledWith('rec-1', undefined)
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('calls onError when modal reject fails', async () => {
    mockReject.mockRejectedValue(new Error('Reject failed'))

    renderTable({ isAdmin: true })

    fireEvent.click(screen.getByRole('button', { name: 'Proposed Topic' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Reject/ }))

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled()
    })
  })
})
