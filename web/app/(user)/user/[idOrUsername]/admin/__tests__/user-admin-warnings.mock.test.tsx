import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'

const { mockGetAdminUserWarnings, mockOnError } = vi.hoisted(() => ({
  mockGetAdminUserWarnings: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/warnings'), () => ({
  getAdminUserWarnings: mockGetAdminUserWarnings,
}))

vi.mock(import('@/lib/on-error'), () => ({ default: mockOnError }))

vi.mock(
  import('@/components/shared/time-ago'),
  () =>
    ({
      TimeAgo: ({ date }: { date: string }) => <time data-testid='time-ago'>{date}</time>,
    }) as unknown as typeof import('@/components/shared/time-ago'),
)

import { UserAdminWarnings } from '../user-admin-warnings'

const makeWarning = (overrides = {}) => ({
  id: 'warning-1',
  user_id: 'user-1',
  community_id: null,
  issued_by_id: 'mod-1',
  reason: 'Spam',
  public_message: 'Please stop.',
  report_id: null,
  created_at: '2026-05-31T00:00:00.000Z',
  community_slug: null,
  issued_by_username: 'moderator',
  ...overrides,
})

describe('UserAdminWarnings', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state initially', () => {
    mockGetAdminUserWarnings.mockReturnValue(new Promise(() => {}))

    render(<UserAdminWarnings userId='user-1' />)

    expect(screen.getByText('Loading warnings…')).toBeVisible()
  })

  it('shows empty state when user has no warnings', async () => {
    mockGetAdminUserWarnings.mockResolvedValueOnce({
      warnings: [],
      page_info: { has_next_page: false, end_cursor: null },
    })

    render(<UserAdminWarnings userId='user-1' />)

    await waitFor(() =>
      expect(screen.getByText('No warnings have been issued to this user.')).toBeVisible(),
    )
  })

  it('renders warnings list when warnings are loaded', async () => {
    mockGetAdminUserWarnings.mockResolvedValueOnce({
      warnings: [makeWarning()],
      page_info: { has_next_page: false, end_cursor: null },
    })

    render(<UserAdminWarnings userId='user-1' />)

    await waitFor(() => expect(screen.getByText('Spam')).toBeVisible())
    expect(screen.getByText('Please stop.')).toBeVisible()
    expect(screen.getByText('Issued by moderator')).toBeVisible()
  })

  it('shows community slug when present', async () => {
    mockGetAdminUserWarnings.mockResolvedValueOnce({
      warnings: [makeWarning({ community_slug: 'credit-cards' })],
      page_info: { has_next_page: false, end_cursor: null },
    })

    render(<UserAdminWarnings userId='user-1' />)

    await waitFor(() => expect(screen.getByText('Community: credit-cards')).toBeVisible())
  })

  it('shows empty state on fetch error', async () => {
    const err = new Error('Network error')
    mockGetAdminUserWarnings.mockRejectedValueOnce(err)

    render(<UserAdminWarnings userId='user-1' />)

    await waitFor(() =>
      expect(screen.getByText('No warnings have been issued to this user.')).toBeVisible(),
    )
    expect(mockOnError).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ fallback: 'Failed to load warnings' }),
    )
  })
})
