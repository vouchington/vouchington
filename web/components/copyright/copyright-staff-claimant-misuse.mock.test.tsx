import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { getClaimantMisuseSummary } from '@/lib/api/client/copyright-notices'
import { makeBusyUsStaffCase } from '@/test-helpers/api-responses/copyright-staff-case'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { mergeMessages } from '@/lib/i18n/use-translations'
import { LocaleProvider } from '@/lib/i18n/ui-locale-context'
import { CopyrightStaffClaimantMisuse } from './copyright-staff-claimant-misuse'

vi.mock(import('@/lib/api/client/copyright-notices'), () => ({
  getClaimantMisuseSummary: vi.fn<typeof getClaimantMisuseSummary>(),
}))

const first = makeBusyUsStaffCase().claimant.misuse!

describe('claimant misuse windows', () => {
  beforeAll(async () => {
    mergeMessages('fr', await loadJsonMessages('fr'))
  })
  it('formats receipt times in the selected UI locale with an explicit timezone', () => {
    const { container } = render(
      <LocaleProvider locale='fr'>
        <CopyrightStaffClaimantMisuse
          claimantUserId='claimant-1'
          misuse={first}
        />
      </LocaleProvider>,
    )
    const times = container.querySelectorAll('time')
    expect(times).toHaveLength(2)
    expect(times[0]).toHaveAttribute('dateTime', first.oldest_notice_at)
    expect(times[1]).toHaveAttribute('dateTime', first.newest_notice_at)
    const frenchDate = new Intl.DateTimeFormat('fr', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'UTC',
      timeZoneName: 'short',
    }).format(new Date(first.oldest_notice_at!))
    expect(times[0]).toHaveTextContent(frenchDate)
    expect(times[0]).toHaveTextContent('UTC')
  })

  it('does not invent receipt times for an empty window', () => {
    const { container } = render(
      <CopyrightStaffClaimantMisuse
        claimantUserId='claimant-1'
        misuse={{
          ...first,
          notice_withdrawn: 0,
          notice_rejected: 0,
          restriction_reversed_by_counter_notice: 0,
          restriction_reversed_by_appeal: 0,
          notice_count: 0,
          oldest_notice_at: null,
          newest_notice_at: null,
        }}
      />,
    )
    expect(screen.getByText('0 notices inspected')).toBeInTheDocument()
    expect(container.querySelector('time')).toBeNull()
    expect(screen.queryByText('Invalid Date')).not.toBeInTheDocument()
  })

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
      oldest_notice_at: '2025-08-01T08:00:00.000Z',
      newest_notice_at: '2025-09-01T09:30:00.000Z',
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
    const latestWindow = screen.getByRole('heading', { name: 'Latest notices' }).parentElement!
    const olderWindow = screen.getByRole('heading', {
      name: 'Older notices, window 2',
    }).parentElement!
    expect(latestWindow.querySelectorAll('time')).toHaveLength(2)
    expect(olderWindow.querySelectorAll('time')).toHaveLength(2)
    expect(
      within(latestWindow)
        .getByText('Oldest notice received')
        .nextElementSibling?.querySelector('time'),
    ).toHaveAttribute('dateTime', first.oldest_notice_at)
    expect(
      within(olderWindow)
        .getByText('Oldest notice received')
        .nextElementSibling?.querySelector('time'),
    ).toHaveAttribute('dateTime', summary.oldest_notice_at)
    expect(screen.getByText('1 notice withdrawn by the notifier')).toBeInTheDocument()
    expect(getClaimantMisuseSummary).toHaveBeenLastCalledWith('claimant-1', 'next')
    expect(screen.queryByRole('button', { name: 'Load older notices' })).not.toBeInTheDocument()
  })
})
