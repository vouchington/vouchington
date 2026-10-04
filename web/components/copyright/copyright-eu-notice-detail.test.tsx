import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeCopyrightEuParticipantNotice } from '@/test-helpers/api-responses/copyright-eu'
import { CopyrightEuNoticeDetail } from './copyright-eu-notice-detail'

describe('CopyrightEuNoticeDetail', () => {
  it('renders a no-action case and its stored statement with EU redress', () => {
    render(<CopyrightEuNoticeDetail notice={makeCopyrightEuParticipantNotice()} />)
    expect(screen.getByText('No action was taken.')).toBeInTheDocument()
    expect(screen.getByText(/Automated means: none/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Complain about this decision' })).toHaveAttribute(
      'href',
      '/copyright/notices/019f0000-0000-7000-8000-000000000001/complaint',
    )
    expect(screen.queryByRole('link', { name: 'Appeal' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Counter-notice' })).not.toBeInTheDocument()
  })
  it('shows a reopened notice without another complaint link', () => {
    render(
      <CopyrightEuNoticeDetail
        notice={makeCopyrightEuParticipantNotice({
          reopenedAt: '2026-10-04T12:00:00Z',
          canSubmit: false,
        })}
      />,
    )
    expect(
      screen.getByText('Your complaint was upheld. Staff are deciding this notice again.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Complain about this decision' }),
    ).not.toBeInTheDocument()
  })
  it('shows the pre-decision state and no complaint cutoff for a never-informed viewer', () => {
    render(
      <CopyrightEuNoticeDetail
        notice={makeCopyrightEuParticipantNotice({
          outcome: null,
          decided_at: null,
          canSubmit: false,
          windowEndsAt: null,
        })}
      />,
    )
    expect(screen.getByText('A moderator is reviewing this notice.')).toBeInTheDocument()
    expect(screen.queryByText(/Complaint period ends/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Complain about this decision' }),
    ).not.toBeInTheDocument()
  })
})
