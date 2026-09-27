import {
  makeRecommendationTableFixture,
  mockApprove,
  mockNav,
  mockOnError,
  mockUpdate,
  tableAuth,
} from '@/test-helpers/components/topic-recommendations/topic-recommendations-table.mock-support'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicRecommendationsTable } from '../topic-recommendations-table'
import type { PostsResponseBody } from '@/types/api-responses'
import type { User } from '@/types/user'

const { basePost, data } = makeRecommendationTableFixture()
const mockRouterPush = mockNav.push

describe('TopicRecommendationsTable — modal actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tableAuth.currentUser = { id: 'user-1' } as User
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
    tableAuth.currentUser = { id: currentUserId } as User
    return render(
      <TopicRecommendationsTable
        data={tableData}
        isAdmin={isAdmin}
      />,
    )
  }

  it('updates then approves from modal when editable state differs from post', async () => {
    mockUpdate.mockResolvedValue({ post: basePost })
    mockApprove.mockResolvedValue({
      post: basePost,
      topic_id: 'topic-changed',
      topic_slug: 'topic-changed-slug',
      topic_type: 'topic',
    })

    renderTable({ isAdmin: true })

    fireEvent.click(screen.getByRole('button', { name: 'Proposed Topic' }))

    const titleField = screen.getByLabelText('Topic title') as HTMLInputElement
    fireEvent.change(titleField, { target: { value: 'Modified Topic Title' } })

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Approve/ }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('rec-1', expect.anything())
    })
    await waitFor(() => {
      expect(mockApprove).toHaveBeenCalledWith('rec-1')
    })
    expect(mockRouterPush).toHaveBeenCalledWith('/topic/topic-changed-slug')
  })

  it('calls onError when modal approve fails', async () => {
    mockApprove.mockRejectedValue(new Error('Approve failed'))

    renderTable({ isAdmin: true })

    fireEvent.click(screen.getByRole('button', { name: 'Proposed Topic' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Approve/ }))

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled()
    })
  })

  it('navigates to next post via Next button in dialog', () => {
    const navPost = {
      ...basePost,
      id: 'rec-nav',
      topic_recommendation: {
        ...basePost.topic_recommendation,
        post_id: 'rec-nav',
        topic_title: 'Nav Target Topic',
        topic_slug: 'nav-target-topic',
      },
    }
    const twoItemData: PostsResponseBody = {
      ...data,
      results: [
        { __entity_type: 'post', id: 'rec-1', ranking: 1, search_vector_ts: null },
        { __entity_type: 'post', id: 'rec-nav', ranking: 2, search_vector_ts: null },
      ],
      posts: { 'rec-1': basePost, 'rec-nav': navPost },
      markdown_to_html: { 'rec-1': '<p>Rationale 1</p>', 'rec-nav': '<p>Rationale nav</p>' },
    }

    renderTable({ tableData: twoItemData })

    fireEvent.click(screen.getByRole('button', { name: 'Proposed Topic' }))
    const nextBtn = document.body.querySelector(
      '[data-pw="topic-recommendation-dialog-next"]',
    ) as HTMLButtonElement | null
    expect(nextBtn).not.toBeNull()
    fireEvent.click(nextBtn!)

    expect(
      within(screen.getByRole('dialog')).getAllByText('Nav Target Topic').length,
    ).toBeGreaterThan(0)
  })

  it('dialog stays open showing original post when no next post exists', () => {
    renderTable()

    fireEvent.click(screen.getByRole('button', { name: 'Proposed Topic' }))
    expect(screen.getByRole('dialog')).toBeDefined()
    expect(
      within(screen.getByRole('dialog')).getAllByText('Proposed Topic').length,
    ).toBeGreaterThan(0)
  })
})
