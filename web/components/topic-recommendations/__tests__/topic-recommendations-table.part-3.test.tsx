import {
  makeRecommendationTableFixture,
  mockOnError,
  mockWithdraw,
  tableAuth,
} from '@/test-helpers/components/topic-recommendations/topic-recommendations-table.mock-support'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicRecommendationsTable } from '../topic-recommendations-table'
import type { PostsResponseBody } from '@/types/api-responses'
import type { User } from '@/types/user'

const { data } = makeRecommendationTableFixture()

describe('TopicRecommendationsTable', () => {
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

  it('calls onError when quick-reject fails', async () => {
    const { rejectTopicRecommendation } = await import('@/lib/api/client/topic-recommendations')
    vi.mocked(rejectTopicRecommendation).mockRejectedValue(new Error('Reject failed'))

    const { container } = renderTable({ isAdmin: true })
    const rejectBtn = container.querySelector('[data-pw="topic-recommendation-row-reject"]')
    expect(rejectBtn).not.toBeNull()
    fireEvent.click(rejectBtn!)

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled()
    })
  })

  it('calls onError when withdraw fails', async () => {
    mockWithdraw.mockRejectedValue(new Error('Withdraw failed'))
    renderTable()

    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Withdraw' }),
    )

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled()
    })
  })

  it('opens dialog via slug button', () => {
    renderTable()
    const slugBtn = screen.getByRole('button', { name: 'proposed-topic' })
    fireEvent.click(slugBtn)
    expect(screen.getByText('Recommendation rationale')).toBeDefined()
  })

  it('opens dialog via date button', () => {
    renderTable()
    // The date button shows localeDateString of created_at
    const dateBtn = screen.getByRole('button', {
      name: new Date('2024-01-01T00:00:00Z').toLocaleDateString(),
    })
    fireEvent.click(dateBtn)
    expect(screen.getByText('Recommendation rationale')).toBeDefined()
  })

  it('shows Unknown when post has no submitter username', () => {
    const noSubmitterData: PostsResponseBody = {
      ...data,
      posts: {
        'rec-1': {
          ...data.posts['rec-1']!,
          created_by: null,
        },
      },
    }
    renderTable({ tableData: noSubmitterData })
    expect(screen.getByText('Unknown')).toBeDefined()
  })
})
