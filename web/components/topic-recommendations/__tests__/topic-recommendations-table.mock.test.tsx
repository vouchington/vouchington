import {
  makeRecommendationTableFixture,
  mockApprove,
  mockNav,
  mockOnError,
  mockUpdate,
  mockWithdraw,
  tableAuth,
} from '@/test-helpers/components/topic-recommendations/topic-recommendations-table.mock-support'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicRecommendationsTable } from '../topic-recommendations-table'
import type { PostsResponseBody } from '@/types/api-responses'
import type { User } from '@/types/user'

const { data } = makeRecommendationTableFixture()
const mockRouterRefresh = mockNav.refresh
const mockRouterPush = mockNav.push

vi.mock(
  import('@/components/shared/entity-action-icons'),
  () =>
    ({
      EntityActionIcons: {
        edit: () => <svg data-testid='edit-icon' />,
        recommendationDismiss: () => <svg data-testid='recommendation-dismiss-icon' />,
        recommendationWithdraw: () => <svg data-testid='recommendation-withdraw-icon' />,
      },
    }) as unknown as typeof import('@/components/shared/entity-action-icons'),
)

describe('TopicRecommendationsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tableAuth.currentUser = { account_type: null, id: 'user-1', roles: [] } as User
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
    tableAuth.currentUser = { account_type: null, id: currentUserId, roles: [] } as User
    return render(
      <TopicRecommendationsTable
        data={tableData}
        isAdmin={isAdmin}
      />,
    )
  }

  it('renders recommendation rows and opens details dialog by clicking title', () => {
    const { container } = renderTable()

    expect(screen.getByText('Proposed Topic')).toBeDefined()
    expect(container.querySelector('[data-pw="topic-recommendations-table"]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Proposed Topic' }))
    expect(screen.getByText('Recommendation rationale')).toBeDefined()
  })

  it('lets admins approve from the modal', async () => {
    mockUpdate.mockResolvedValue({ post: data.posts['rec-1']! })
    mockApprove.mockResolvedValue({
      post: data.posts['rec-1']!,
      topic_id: 'topic-1',
      topic_slug: 'topic-slug-1',
      topic_type: 'topic',
    })

    renderTable({ isAdmin: true })

    fireEvent.click(screen.getByRole('button', { name: 'Proposed Topic' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Approve/ }))

    await waitFor(() => {
      expect(mockApprove).toHaveBeenCalledWith('rec-1')
    })
    expect(mockRouterPush).toHaveBeenCalledWith('/topic/topic-slug-1')
  })

  it('lets admins save changes from the modal', async () => {
    mockUpdate.mockResolvedValue({ post: data.posts['rec-1']! })

    const { baseElement } = renderTable({ isAdmin: true })

    fireEvent.click(screen.getByRole('button', { name: 'Proposed Topic' }))
    // Save Changes is a submit button inside the dialog form
    const dialogForm =
      baseElement
        .querySelector('[data-pw="topic-recommendation-dialog-footer"]')
        ?.closest('form') ?? baseElement.querySelector('form')
    expect(dialogForm).not.toBeNull()
    if (dialogForm) fireEvent.submit(dialogForm)

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('rec-1', expect.anything())
    })
  })

  it('shows an error when saving changes fails', async () => {
    mockUpdate.mockRejectedValue(new Error('Save failed'))

    const { baseElement } = renderTable({ isAdmin: true })

    fireEvent.click(screen.getByRole('button', { name: 'Proposed Topic' }))
    const dialogForm =
      baseElement
        .querySelector('[data-pw="topic-recommendation-dialog-footer"]')
        ?.closest('form') ?? baseElement.querySelector('form')
    if (dialogForm) fireEvent.submit(dialogForm)

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled()
    })
  })

  it('shows Withdraw for pending owner rows and removes the row after confirmation', async () => {
    mockWithdraw.mockResolvedValue(undefined)
    renderTable()

    const withdrawButton = screen.getByRole('button', { name: 'Withdraw' })
    expect(withdrawButton).toContainElement(screen.getByTestId('recommendation-withdraw-icon'))
    fireEvent.click(withdrawButton)
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Withdraw' }),
    )

    await waitFor(() => {
      expect(mockWithdraw).toHaveBeenCalledWith('rec-1')
    })
    await waitFor(() => {
      expect(screen.queryByText('Proposed Topic')).toBeNull()
    })
    expect(mockRouterRefresh).toHaveBeenCalled()
  })
})
