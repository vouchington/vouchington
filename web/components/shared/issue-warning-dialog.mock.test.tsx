import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockIssueAdminUserWarning, mockIssueCommunityUserWarning, mockOnError, mockOnSuccess } =
  vi.hoisted(() => ({
    mockIssueAdminUserWarning: vi.fn<VitestLooseMock>(),
    mockIssueCommunityUserWarning: vi.fn<VitestLooseMock>(),
    mockOnError: vi.fn<VitestLooseMock>(),
    mockOnSuccess: vi.fn<VitestLooseMock>(),
  }))

vi.mock(import('@/lib/api/client/warnings'), () => ({
  issueAdminUserWarning: mockIssueAdminUserWarning,
  issueCommunityUserWarning: mockIssueCommunityUserWarning,
}))

vi.mock(import('@/lib/on-error'), () => ({ default: mockOnError, onSuccess: mockOnSuccess }))

import { IssueWarningDialog } from './issue-warning-dialog'

const fakeWarning = {
  warning: {
    id: 'warning-1',
    user_id: 'user-1',
    community_id: null,
    issued_by_id: 'mod-1',
    reason: 'Spam',
    public_message: null,
    report_id: null,
    created_at: '2026-05-31T00:00:00.000Z',
    community_slug: null,
    issued_by_username: 'moderator',
  },
}

describe('IssueWarningDialog', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  function openDialog() {
    fireEvent.click(screen.getByRole('button', { name: /issue warning/i }))
  }

  function fillReason(value: string) {
    fireEvent.change(screen.getByPlaceholderText(/internal reason/i), {
      target: { value },
    })
  }

  function submitForm() {
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /issue warning/i }),
    )
  }

  it('renders a default trigger button', () => {
    render(<IssueWarningDialog userId='user-1' />)
    expect(screen.getByRole('button', { name: /issue warning/i })).toBeInTheDocument()
  })

  it('renders a custom trigger when children are provided', () => {
    render(
      <IssueWarningDialog userId='user-1'>
        <button type='button'>Custom trigger</button>
      </IssueWarningDialog>,
    )
    expect(screen.getByRole('button', { name: 'Custom trigger' })).toBeInTheDocument()
  })

  it('opens the dialog when trigger is clicked', () => {
    render(<IssueWarningDialog userId='user-1' />)
    openDialog()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('submit button is disabled when reason is empty', () => {
    render(<IssueWarningDialog userId='user-1' />)
    openDialog()
    const submitBtn = within(screen.getByRole('dialog')).getByRole('button', {
      name: /issue warning/i,
    })
    expect(submitBtn).toBeDisabled()
  })

  it('calls issueAdminUserWarning when no communitySlug is provided', async () => {
    mockIssueAdminUserWarning.mockResolvedValueOnce(fakeWarning)
    const onIssued = vi.fn<VitestLooseMock>()
    render(
      <IssueWarningDialog
        userId='user-1'
        reportId='report-1'
        onIssued={onIssued}
      />,
    )

    openDialog()
    fillReason('Posting spam')
    submitForm()

    await waitFor(() =>
      expect(mockIssueAdminUserWarning).toHaveBeenCalledWith({
        userId: 'user-1',
        reason: 'Posting spam',
        publicMessage: null,
        reportId: 'report-1',
        resolveReport: true,
      }),
    )
    expect(mockOnSuccess).toHaveBeenCalledWith('Warning issued')
    expect(onIssued).toHaveBeenCalledWith(fakeWarning)
  })

  it('calls issueCommunityUserWarning when communitySlug is provided', async () => {
    mockIssueCommunityUserWarning.mockResolvedValueOnce(fakeWarning)
    render(
      <IssueWarningDialog
        userId='user-1'
        communitySlug='credit-cards'
        reportId='report-42'
      />,
    )

    openDialog()
    fillReason('Harassment')
    submitForm()

    await waitFor(() =>
      expect(mockIssueCommunityUserWarning).toHaveBeenCalledWith('credit-cards', {
        userId: 'user-1',
        reason: 'Harassment',
        publicMessage: null,
        reportId: 'report-42',
        resolveReport: true,
      }),
    )
  })

  it('includes publicMessage when filled in', async () => {
    mockIssueAdminUserWarning.mockResolvedValueOnce(fakeWarning)
    render(<IssueWarningDialog userId='user-1' />)

    openDialog()
    fillReason('Spam')
    fireEvent.change(screen.getByPlaceholderText(/message shown to the user/i), {
      target: { value: 'Please review the rules.' },
    })
    submitForm()

    await waitFor(() =>
      expect(mockIssueAdminUserWarning).toHaveBeenCalledWith(
        expect.objectContaining({ publicMessage: 'Please review the rules.' }),
      ),
    )
  })

  it('closes dialog and resets fields after successful submission', async () => {
    mockIssueAdminUserWarning.mockResolvedValueOnce(fakeWarning)
    render(<IssueWarningDialog userId='user-1' />)

    openDialog()
    fillReason('Spam')
    submitForm()

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('routes errors through onError and keeps dialog open', async () => {
    const err = new Error('Server error')
    mockIssueAdminUserWarning.mockRejectedValueOnce(err)
    render(<IssueWarningDialog userId='user-1' />)

    openDialog()
    fillReason('Spam')
    submitForm()

    await waitFor(() =>
      expect(mockOnError).toHaveBeenCalledWith(
        err,
        expect.objectContaining({ fallback: 'Failed to issue warning' }),
      ),
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('resets fields when dialog is closed without submitting', () => {
    render(<IssueWarningDialog userId='user-1' />)

    openDialog()
    fillReason('Some reason')
    // Close dialog via Escape
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    // Re-open
    openDialog()
    expect(screen.getByPlaceholderText(/internal reason/i)).toHaveValue('')
  })
})
