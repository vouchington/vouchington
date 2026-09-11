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
      new Promise(resolve => queueMicrotask(() => resolve({ links: [], users: {} }))),
    )

    render(<ReferralLinksShowAll referralProgramId='rp-1' />)

    fireEvent.click(screen.getByRole('button', { name: /Show All Referral Links/i }))

    // Button should be disabled while the promise is still pending
    expect(screen.getByRole('button', { name: /Loading/i })).toBeDisabled()
  })
})
