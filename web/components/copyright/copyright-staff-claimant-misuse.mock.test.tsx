import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { getClaimantMisuseSummary } from '@/lib/api/client/copyright-notices'
import { makeBusyUsStaffCase } from '@/test-helpers/api-responses/copyright-staff-case'
import { CopyrightStaffClaimantMisuse } from './copyright-staff-claimant-misuse'

vi.mock(import('@/lib/api/client/copyright-notices'), () => ({
  getClaimantMisuseSummary: vi.fn<typeof getClaimantMisuseSummary>(),
}))

const first = makeBusyUsStaffCase().claimant.misuse!

describe('claimant misuse windows', () => {
  it('shows a loading state while fetching an older window', async () => {
    let resolve!: (value: { claimant_misuse: typeof first }) => void
    vi.mocked(getClaimantMisuseSummary).mockReturnValueOnce(
      new Promise(done => {
        resolve = done
      }),
    )
    render(
      <CopyrightStaffClaimantMisuse
        claimantUserId='claimant-1'
        misuse={{
          ...first,
          page_info: { has_next_page: true, start_cursor: 'new', end_cursor: 'next' },
        }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Load older notices' }))
    expect(screen.getByRole('button', { name: 'Loading older notices…' })).toBeDisabled()
    resolve({ claimant_misuse: first })
    expect(await screen.findByText('Older notices, window 2')).toBeInTheDocument()
  })

  it('retries a failed request and shows older counts separately', async () => {
    const summary = {
      ...first,
      notice_withdrawn: 0,
      notice_rejected: 0,
      restriction_reversed_by_appeal: 0,
      notice_count: 2,
      page_info: { has_next_page: false, start_cursor: 'older', end_cursor: 'oldest' },
    }
    vi.mocked(getClaimantMisuseSummary)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ claimant_misuse: summary })
    render(
      <CopyrightStaffClaimantMisuse
        claimantUserId='claimant-1'
        misuse={{
          ...first,
          page_info: { has_next_page: true, start_cursor: 'new', end_cursor: 'next' },
        }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Load older notices' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load older notices')
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading older notices' }))
    expect(await screen.findByText('Older notices, window 2')).toBeInTheDocument()
    expect(screen.getByText('No misuse recorded in this window.')).toBeInTheDocument()
    expect(screen.getByText('2 notices inspected')).toBeInTheDocument()
    expect(screen.getByText('1 notice withdrawn by the notifier')).toBeInTheDocument()
    expect(getClaimantMisuseSummary).toHaveBeenLastCalledWith('claimant-1', 'next')
    expect(screen.queryByRole('button', { name: 'Load older notices' })).not.toBeInTheDocument()
  })
})
