import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LinkValidationForm } from '../link-validation-form'
import {
  getReferralLinkValidation,
  linkValidationToReferralProgram,
} from '@/lib/api/client/referral-link-validations'
import { ApiError } from '@/lib/api/error'
import onError, { onSuccess } from '@/lib/on-error'

vi.mock(import('next/navigation'), () => ({
  useRouter: vi.fn<VitestLooseMock>(() => ({ refresh: vi.fn<VitestLooseMock>() })),
}))

vi.mock(import('@/lib/api/client/referral-link-validations'), () => ({
  getReferralLinkValidation: vi.fn<VitestLooseMock>(),
  linkValidationToReferralProgram: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))

const mockGetReferralLinkValidation = vi.mocked(getReferralLinkValidation)
const mockLinkValidationToReferralProgram = vi.mocked(linkValidationToReferralProgram)
const mockOnError = vi.mocked(onError)
const mockOnSuccess = vi.mocked(onSuccess)

const VALID_UUID = '00000000-0000-0000-0000-000000000001'

describe('LinkValidationForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submit button is disabled when input is empty', () => {
    render(<LinkValidationForm referralProgramId='program-1' />)
    const btn = screen.getByRole('button', { name: /link/i })
    expect(btn).toBeDisabled()
  })

  it('calls linkValidationToReferralProgram directly when input is a UUID', async () => {
    mockLinkValidationToReferralProgram.mockResolvedValueOnce(undefined)

    render(<LinkValidationForm referralProgramId='program-1' />)

    const input = screen.getByLabelText('Validation Slug')
    fireEvent.change(input, { target: { value: VALID_UUID } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(mockLinkValidationToReferralProgram).toHaveBeenCalledWith('program-1', VALID_UUID)
    })
    expect(mockGetReferralLinkValidation).not.toHaveBeenCalled()
    expect(mockOnSuccess).toHaveBeenCalled()
  })

  it('looks up validation by slug then links it', async () => {
    const validation = {
      id: 'val-id-1',
      slug: 'chase-sapphire',
      user_help_text: '',
      updated_at: '',
    }
    mockGetReferralLinkValidation.mockResolvedValueOnce({ validation })
    mockLinkValidationToReferralProgram.mockResolvedValueOnce(undefined)

    render(<LinkValidationForm referralProgramId='program-1' />)

    const input = screen.getByLabelText('Validation Slug')
    fireEvent.change(input, { target: { value: 'chase-sapphire' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(mockGetReferralLinkValidation).toHaveBeenCalledWith('chase-sapphire')
      expect(mockLinkValidationToReferralProgram).toHaveBeenCalledWith('program-1', 'val-id-1')
    })
    expect(mockOnSuccess).toHaveBeenCalledWith('Linked validation "chase-sapphire"')
  })

  it('shows validation-not-found error when slug lookup returns 404', async () => {
    const notFoundError = new ApiError('Not Found', 404)
    mockGetReferralLinkValidation.mockRejectedValueOnce(notFoundError)

    render(<LinkValidationForm referralProgramId='program-1' />)

    const input = screen.getByLabelText('Validation Slug')
    fireEvent.change(input, { target: { value: 'unknown-slug' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ fallback: expect.stringContaining('unknown-slug') }),
      )
    })
    expect(mockLinkValidationToReferralProgram).not.toHaveBeenCalled()
  })

  it('calls onError when linkValidationToReferralProgram throws', async () => {
    mockLinkValidationToReferralProgram.mockRejectedValueOnce(new Error('API error'))

    render(<LinkValidationForm referralProgramId='program-1' />)

    const input = screen.getByLabelText('Validation Slug')
    fireEvent.change(input, { target: { value: VALID_UUID } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ fallback: 'Failed to link validation' }),
      )
    })
  })

  it('clears input after successful link', async () => {
    mockLinkValidationToReferralProgram.mockResolvedValueOnce(undefined)

    render(<LinkValidationForm referralProgramId='program-1' />)

    const input = screen.getByLabelText('Validation Slug') as HTMLInputElement
    fireEvent.change(input, { target: { value: VALID_UUID } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled()
    })
    expect(input.value).toBe('')
  })
})
