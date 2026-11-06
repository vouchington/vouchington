import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { ReferralLinksShowAll } from '../referral-links-show-all'
import { getAllReferralLinks } from '@/lib/api/client/referral-links'
import onError from '@/lib/on-error'

vi.mock(import('@/lib/api/client/referral-links'), () => ({
  getAllReferralLinks: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: ReactNode
        href: string
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

const mockGetAllReferralLinks = vi.mocked(getAllReferralLinks)
const mockOnError = vi.mocked(onError)

function page(id: string, userId: string, endCursor: string | null) {
  return {
    links: [
      {
        id,
        user_id: userId,
        is_official: false,
        referral_program_id: 'rp-1',
        url: `https://example.com/${id}`,
        label: `Link ${id}`,
        priority_group: 6,
        contribution_rank: 0,
        tier_rank: 0,
        best_score: 0,
        review_post_id: null,
        review_post_slug: null,
        review_avg_rating: null,
      },
    ],
    users: { [userId]: { id: userId, username: `user-${userId}`, display_name: null } },
    page_info: { has_next_page: endCursor !== null, start_cursor: id, end_cursor: endCursor },
  }
}

describe('ReferralLinksShowAll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Show All Referral Links button', () => {
    render(<ReferralLinksShowAll referralProgramId='rp-1' />)

    expect(screen.getByRole('button', { name: /Show All Referral Links/i })).toBeInTheDocument()
  })

  it('loads and shows all-heading when button clicked', async () => {
    mockGetAllReferralLinks.mockResolvedValue({ links: [], users: {} })

    render(<ReferralLinksShowAll referralProgramId='rp-1' />)

    fireEvent.click(screen.getByRole('button', { name: /Show All Referral Links/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /All Referral Links/i })).toBeInTheDocument()
    })
  })

  it('shows empty state when no links found', async () => {
    mockGetAllReferralLinks.mockResolvedValue({ links: [], users: {} })

    render(<ReferralLinksShowAll referralProgramId='rp-1' />)

    fireEvent.click(screen.getByRole('button', { name: /Show All Referral Links/i }))

    await waitFor(() => {
      expect(screen.getByText('No referral links found.')).toBeInTheDocument()
    })
  })

  it('calls onError when load fails', async () => {
    mockGetAllReferralLinks.mockRejectedValue(new Error('Network error'))

    render(<ReferralLinksShowAll referralProgramId='rp-1' />)

    fireEvent.click(screen.getByRole('button', { name: /Show All Referral Links/i }))

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled()
    })
  })

  it('button is disabled while loading', async () => {
    // Resolve after a microtask so we can check the disabled state synchronously
    mockGetAllReferralLinks.mockReturnValue(
      new Promise(resolve => {
        queueMicrotask(() => resolve({ links: [], users: {} }))
      }),
    )

    render(<ReferralLinksShowAll referralProgramId='rp-1' />)

    fireEvent.click(screen.getByRole('button', { name: /Show All Referral Links/i }))

    // Button should be disabled while the promise is still pending
    expect(screen.getByRole('button', { name: /Loading/i })).toBeDisabled()
  })

  it('appends the next page with its cursor and stops when there are no more pages', async () => {
    mockGetAllReferralLinks
      .mockResolvedValueOnce(page('a', 'u1', 'cursor-a'))
      .mockResolvedValueOnce(page('b', 'u2', null))

    render(<ReferralLinksShowAll referralProgramId='rp-1' />)
    fireEvent.click(screen.getByRole('button', { name: /Show All Referral Links/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Load more/i }))

    expect(await screen.findByText('Link b')).toBeInTheDocument()
    expect(screen.getByText('Link a')).toBeInTheDocument()
    expect(mockGetAllReferralLinks).toHaveBeenLastCalledWith('rp-1', 'cursor-a')
    expect(screen.queryByRole('button', { name: /Load more/i })).not.toBeInTheDocument()
  })

  it('keeps loaded links and retries the same cursor after a page fails', async () => {
    mockGetAllReferralLinks
      .mockResolvedValueOnce(page('a', 'u1', 'cursor-a'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page('b', 'u2', null))

    render(<ReferralLinksShowAll referralProgramId='rp-1' />)
    fireEvent.click(screen.getByRole('button', { name: /Show All Referral Links/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Load more/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Link a')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Retry/i }))

    expect(await screen.findByText('Link b')).toBeInTheDocument()
    expect(mockGetAllReferralLinks).toHaveBeenLastCalledWith('rp-1', 'cursor-a')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
