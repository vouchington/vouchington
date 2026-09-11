import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReferralLinkForm } from '../referral-link-form'
import {
  createReferralLink,
  updateReferralLink,
  deleteReferralLink,
} from '@/lib/api/client/referral-links'
import onError, { onSuccess } from '@/lib/on-error'

vi.mock(import('next/navigation'), () => ({
  useRouter: vi.fn<VitestLooseMock>(() => ({ refresh: vi.fn<VitestLooseMock>() })),
}))

vi.mock(import('@/lib/api/client/referral-links'), () => ({
  createReferralLink: vi.fn<VitestLooseMock>(),
  updateReferralLink: vi.fn<VitestLooseMock>(),
  deleteReferralLink: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/components/shared/entity-action-icons'),
  () =>
    ({
      EntityActionIcons: {
        delete: () => <svg data-testid='delete-icon' />,
        edit: () => <svg data-testid='edit-icon' />,
        referralLinkCreate: () => <svg data-testid='referral-link-create-icon' />,
      },
    }) as unknown as typeof import('@/components/shared/entity-action-icons'),
)

const mockCreateReferralLink = vi.mocked(createReferralLink)
const mockUpdateReferralLink = vi.mocked(updateReferralLink)
const mockDeleteReferralLink = vi.mocked(deleteReferralLink)
const mockOnError = vi.mocked(onError)
const mockOnSuccess = vi.mocked(onSuccess)

const existingLink = {
  id: 'link-1',
  url: 'https://bank.com/ref/existing',
  label: 'My link',
  referral_program_id: 'program-1',
  user_id: 'user-1',
}

describe('ReferralLinkForm — error handling and success', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows success toast when referral link is saved', async () => {
    mockCreateReferralLink.mockResolvedValue(undefined)

    render(<ReferralLinkForm referralProgramId='program-1' />)

    const urlInput = screen.getByLabelText('Referral URL') as HTMLInputElement
    fireEvent.change(urlInput, { target: { value: 'https://bank.com/ref/you' } })

    const form = urlInput.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled()
    })
  })

  it('calls onError when API throws', async () => {
    mockCreateReferralLink.mockRejectedValue(new Error('Invalid referral link URL'))

    render(<ReferralLinkForm referralProgramId='program-1' />)

    const urlInput = screen.getByLabelText('Referral URL') as HTMLInputElement
    fireEvent.change(urlInput, { target: { value: 'https://bank.com/ref/you' } })

    const form = urlInput.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ fallback: expect.any(String) }),
      )
    })
  })

  it('button is disabled when URL is empty', () => {
    render(<ReferralLinkForm referralProgramId='program-1' />)

    const submitButton = screen.getByRole('button', { name: /add link/i })
    expect(submitButton).toContainElement(screen.getByTestId('referral-link-create-icon'))
    expect(submitButton).toBeDisabled()
  })

  it('shows validationInfo placeholder when provided', () => {
    render(
      <ReferralLinkForm
        referralProgramId='program-1'
        validationInfo={{ user_help_text: '', example_urls: ['https://bank.com/ref/you'] }}
      />,
    )

    const urlInput = screen.getByLabelText('Referral URL') as HTMLInputElement
    expect(urlInput).toHaveAttribute('placeholder', 'https://bank.com/ref/you')
  })

  it('shows user_help_text when provided', () => {
    render(
      <ReferralLinkForm
        referralProgramId='program-1'
        validationInfo={{
          user_help_text: 'Find your link in Account settings',
          example_urls: [],
        }}
      />,
    )

    expect(screen.getByText('Find your link in Account settings')).toBeInTheDocument()
  })

  it('calls deleteReferralLink and clears state on delete', async () => {
    mockDeleteReferralLink.mockResolvedValueOnce(undefined)

    render(
      <ReferralLinkForm
        referralProgramId='program-1'
        existingLink={existingLink}
      />,
    )

    const deleteButton = screen.getByRole('button', { name: /delete/i })
    expect(deleteButton).toContainElement(screen.getByTestId('delete-icon'))
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(mockDeleteReferralLink).toHaveBeenCalledWith('link-1')
      expect(mockOnSuccess).toHaveBeenCalledWith('Referral link deleted')
    })
  })

  it('calls onError when delete fails', async () => {
    mockDeleteReferralLink.mockRejectedValueOnce(new Error('Delete failed'))

    render(
      <ReferralLinkForm
        referralProgramId='program-1'
        existingLink={existingLink}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /delete/i }))

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ fallback: 'Failed to delete referral link' }),
      )
    })
  })

  it('does not submit when no existingLink and URL is empty', () => {
    render(<ReferralLinkForm referralProgramId='program-1' />)
    // Submit form directly (bypassing button disabled state)
    const form = screen.getByRole('heading', { name: /add your referral link/i }).closest('form')!
    fireEvent.submit(form)
    expect(mockCreateReferralLink).not.toHaveBeenCalled()
  })

  it('calls updateReferralLink when editing existing link', async () => {
    mockUpdateReferralLink.mockResolvedValueOnce(undefined)

    render(
      <ReferralLinkForm
        referralProgramId='program-1'
        existingLink={existingLink}
      />,
    )

    const labelInput = screen.getByLabelText('Label (optional)') as HTMLInputElement
    fireEvent.change(labelInput, { target: { value: 'Updated label' } })

    const form = screen.getByRole('heading', { name: /edit your referral link/i }).closest('form')!
    expect(screen.getByRole('button', { name: /update link/i })).toContainElement(
      screen.getByTestId('edit-icon'),
    )
    fireEvent.submit(form)

    await waitFor(() => {
      expect(mockUpdateReferralLink).toHaveBeenCalledWith('link-1', { label: 'Updated label' })
      expect(mockOnSuccess).toHaveBeenCalledWith('Referral link saved')
    })
  })
})
