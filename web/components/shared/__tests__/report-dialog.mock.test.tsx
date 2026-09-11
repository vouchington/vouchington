import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApiError } from '@/lib/api/error'

const { mockSubmitReport, mockToastError } = vi.hoisted(() => ({
  mockSubmitReport: vi.fn<VitestLooseMock>(),
  mockToastError: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/lib/api/client/reports'),
  () =>
    ({
      submitReport: mockSubmitReport,
      REPORT_REASONS: [
        { value: 'spam', label: 'Spam' },
        { value: 'harassment', label: 'Harassment' },
        { value: 'misinformation', label: 'Misinformation' },
        { value: 'illegal_content', label: 'Illegal content' },
        { value: 'vote_manipulation', label: 'Vote manipulation' },
        { value: 'other', label: 'Other' },
      ],
    }) as unknown as typeof import('@/lib/api/client/reports'),
)

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { error: mockToastError },
    }) as unknown as typeof import('sonner'),
)

import { ReportDialog } from '../report-dialog'

describe('ReportDialog', () => {
  const defaultProps = {
    entityType: 'post' as const,
    entityId: 'post-1',
    open: true,
    onOpenChange: vi.fn<VitestLooseMock>(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  it('renders reason radios when open', () => {
    render(<ReportDialog {...defaultProps} />)
    expect(screen.getByRole('radio', { name: 'Spam' })).toBeDefined()
    expect(screen.getByRole('radio', { name: 'Harassment' })).toBeDefined()
    expect(screen.getByRole('radio', { name: 'Misinformation' })).toBeDefined()
    expect(screen.getByRole('radio', { name: 'Illegal content' })).toBeDefined()
    expect(screen.getByRole('radio', { name: 'Vote manipulation' })).toBeDefined()
    expect(screen.getByRole('radio', { name: 'Other' })).toBeDefined()
  })

  it('submit button is disabled until a reason is selected', () => {
    render(<ReportDialog {...defaultProps} />)
    const submitBtn = screen.getByRole('button', { name: 'Submit report' })
    expect(submitBtn).toHaveProperty('disabled', true)

    fireEvent.click(screen.getByRole('radio', { name: 'Spam' }))
    expect(submitBtn).toHaveProperty('disabled', false)
  })

  it('enables submit when vote_manipulation is selected for a post', () => {
    render(<ReportDialog {...defaultProps} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Vote manipulation' }))
    expect(screen.getByRole('button', { name: 'Submit report' })).toHaveProperty('disabled', false)
  })

  it('does not render vote_manipulation radio for non-post entities', () => {
    render(
      <ReportDialog
        {...defaultProps}
        entityType='user'
      />,
    )
    expect(screen.queryByRole('radio', { name: 'Vote manipulation' })).toBeNull()
  })

  it('can select a reason and submit; shows success state', async () => {
    mockSubmitReport.mockResolvedValueOnce({ report: { id: 'r1', status: 'pending' } })
    render(<ReportDialog {...defaultProps} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Spam' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }))

    await waitFor(() => {
      expect(screen.getByText(/report submitted/i)).toBeDefined()
    })
    expect(mockSubmitReport).toHaveBeenCalledWith({
      entityType: 'post',
      entityId: 'post-1',
      reason: 'spam',
      note: undefined,
      cf_turnstile_response: 'test-turnstile-token',
    })
  })

  it('shows 429 toast and keeps dialog open on rate limit error', async () => {
    mockSubmitReport.mockRejectedValueOnce(new ApiError('Too many requests', 429, {}))
    const onOpenChange = vi.fn<VitestLooseMock>()
    render(
      <ReportDialog
        {...defaultProps}
        onOpenChange={onOpenChange}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Other' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'You are reporting too often. Please wait an hour.',
      )
    })
    // Dialog stays open — onOpenChange should not have been called with false by the submit
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    // Form is still visible
    expect(screen.getByRole('radio', { name: 'Spam' })).toBeDefined()
  })

  it('shows inline error on 422', async () => {
    mockSubmitReport.mockRejectedValueOnce(
      new ApiError('Validation failed', 422, { message: 'Validation failed' }),
    )
    render(<ReportDialog {...defaultProps} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Other' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined()
    })
  })

  it('shows success state immediately on reopen when sessionStorage flag is set', () => {
    sessionStorage.setItem('report:post:post-1', 'submitted')
    render(<ReportDialog {...defaultProps} />)
    expect(screen.getByText(/report submitted/i)).toBeDefined()
  })

  it('updates success state when another report control submits the same entity', async () => {
    render(<ReportDialog {...defaultProps} />)
    window.dispatchEvent(
      new CustomEvent('voucha:report-submitted', { detail: { key: 'report:post:post-1' } }),
    )

    await waitFor(() => {
      expect(screen.getByText(/report submitted/i)).toBeDefined()
    })
  })

  it('removes the submit button after success', async () => {
    mockSubmitReport.mockResolvedValueOnce({ report: { id: 'r1', status: 'pending' } })
    render(<ReportDialog {...defaultProps} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Spam' }))
    const submitBtn = screen.getByRole('button', { name: 'Submit report' })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText(/report submitted/i)).toBeDefined()
    })
    expect(screen.queryByRole('button', { name: 'Submit report' })).toBeNull()
  })
})
