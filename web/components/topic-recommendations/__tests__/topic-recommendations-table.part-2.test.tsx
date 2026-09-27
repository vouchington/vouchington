import {
  makeRecommendationTableFixture,
  mockApprove,
  mockNav,
  mockOnError,
  mockOnSuccess,
  tableAuth,
} from '@/test-helpers/components/topic-recommendations/topic-recommendations-table.mock-support'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicRecommendationsTable } from '../topic-recommendations-table'
import type { PostsResponseBody } from '@/types/api-responses'
import type { User } from '@/types/user'

const { data } = makeRecommendationTableFixture()
const mockRouterRefresh = mockNav.refresh

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

  it('hides owner-only row actions for non-owners', () => {
    renderTable({ currentUserId: 'user-2' })

    expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull()
    // Non-owner, non-admin: no action buttons (approve/reject also hidden since not admin)
    expect(screen.getByText('Proposed Topic')).toBeDefined()
  })

  it('does not show Withdraw for approved recommendations or admins', () => {
    const approvedData = structuredClone(data)
    approvedData.posts['rec-1']!.topic_recommendation!.status = 'approved'
    const approvedRender = renderTable({ tableData: approvedData })
    expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull()

    approvedRender.unmount()
    renderTable({ isAdmin: true })
    expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull()
  })

  it('shows quick Approve and Reject buttons for admins on pending rows', () => {
    renderTable({ isAdmin: true })

    expect(screen.getByRole('button', { name: 'Approve' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDefined()
  })

  it('quick-approves from the row without opening modal', async () => {
    mockApprove.mockResolvedValue({
      post: data.posts['rec-1']!,
      topic_id: 'topic-1',
      topic_slug: 'topic-slug-1',
      topic_type: 'topic',
    })

    const { container } = renderTable({ isAdmin: true })
    const approveBtn = container.querySelector('[data-pw="topic-recommendation-row-approve"]')
    expect(approveBtn).not.toBeNull()
    fireEvent.click(approveBtn!)

    await waitFor(() => {
      expect(mockApprove).toHaveBeenCalledWith('rec-1')
    })
    expect(mockOnSuccess).toHaveBeenCalledWith('Recommendation approved')
    expect(mockRouterRefresh).toHaveBeenCalled()
  })

  it('quick-rejects from the row without opening modal', async () => {
    const { rejectTopicRecommendation } = await import('@/lib/api/client/topic-recommendations')
    vi.mocked(rejectTopicRecommendation).mockResolvedValue({ post: data.posts['rec-1']! })

    const { container } = renderTable({ isAdmin: true })
    const rejectBtn = container.querySelector('[data-pw="topic-recommendation-row-reject"]')
    expect(rejectBtn).not.toBeNull()
    fireEvent.click(rejectBtn!)

    await waitFor(() => {
      expect(vi.mocked(rejectTopicRecommendation)).toHaveBeenCalledWith('rec-1')
    })
    expect(mockOnSuccess).toHaveBeenCalledWith('Recommendation rejected')
  })

  it('calls onError when quick-approve fails', async () => {
    mockApprove.mockRejectedValue(new Error('Approve failed'))

    const { container } = renderTable({ isAdmin: true })
    const approveBtn = container.querySelector('[data-pw="topic-recommendation-row-approve"]')
    expect(approveBtn).not.toBeNull()
    fireEvent.click(approveBtn!)

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled()
    })
  })
})
