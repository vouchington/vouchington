import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ValidationForm } from '../validation-form'
import {
  createAndLinkValidationToReferralProgram,
  createReferralLinkValidation,
  updateReferralLinkValidation,
} from '@/lib/api/client/referral-link-validations'
import onError, { onSuccess } from '@/lib/on-error'

vi.mock(import('next/navigation'), () => ({
  useRouter: vi.fn<VitestLooseMock>(() => ({
    replace: vi.fn<VitestLooseMock>(),
    push: vi.fn<VitestLooseMock>(),
  })),
}))

vi.mock(import('@/lib/api/client/referral-link-validations'), () => ({
  createAndLinkValidationToReferralProgram: vi.fn<VitestLooseMock>(),
  createReferralLinkValidation: vi.fn<VitestLooseMock>(),
  updateReferralLinkValidation: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))

const mockCreateAndLink = vi.mocked(createAndLinkValidationToReferralProgram)
const mockCreate = vi.mocked(createReferralLinkValidation)
const mockUpdate = vi.mocked(updateReferralLinkValidation)
const mockOnError = vi.mocked(onError)
const mockOnSuccess = vi.mocked(onSuccess)

const fakeValidation = {
  id: 'val-1',
  slug: 'chase-sapphire',
  user_help_text: 'Existing help text',
  updated_at: '2024-01-01T00:00:00.000Z',
}

describe('ValidationForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('create mode (no existing prop)', () => {
    it('submit button is disabled when slug is empty', () => {
      render(<ValidationForm basePath='/referral-program/test-rp/validations' />)
      const btn = screen.getByRole('button', { name: /create/i })
      expect(btn).toBeDisabled()
    })

    it('calls createReferralLinkValidation with slug and user_help_text on submit', async () => {
      const result = { validation: fakeValidation }
      mockCreate.mockResolvedValueOnce(result)

      render(<ValidationForm basePath='/referral-program/test-rp/validations' />)

      fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'chase-sapphire' } })
      fireEvent.change(screen.getByLabelText('User Help Text'), {
        target: { value: 'Find your link here' },
      })
      fireEvent.submit(screen.getByRole('button', { name: /create/i }).closest('form')!)

      await waitFor(() => {
        expect(mockCreate).toHaveBeenCalledWith({
          slug: 'chase-sapphire',
          user_help_text: 'Find your link here',
        })
      })
      expect(mockOnSuccess).toHaveBeenCalledWith('Validation created')
    })

    it('calls onError when create fails', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Server error'))

      render(<ValidationForm basePath='/referral-program/test-rp/validations' />)

      fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'some-slug' } })
      fireEvent.submit(screen.getByRole('button', { name: /create/i }).closest('form')!)

      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({ fallback: 'Failed to save validation' }),
        )
      })
    })

    it('calls createAndLinkValidationToReferralProgram when referralProgramId is provided', async () => {
      mockCreateAndLink.mockResolvedValueOnce({ validation: fakeValidation })

      render(
        <ValidationForm
          basePath='/referral-program/test-rp/validations'
          referralProgramId='prog-1'
        />,
      )

      fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'chase-sapphire' } })
      fireEvent.submit(screen.getByRole('button', { name: /create/i }).closest('form')!)

      await waitFor(() => {
        expect(mockCreateAndLink).toHaveBeenCalledWith('prog-1', {
          slug: 'chase-sapphire',
          user_help_text: undefined,
        })
        expect(mockOnSuccess).toHaveBeenCalledWith('Validation created')
      })
    })
  })

  describe('edit mode (existing prop provided)', () => {
    it('pre-fills slug and user_help_text from existing', () => {
      render(
        <ValidationForm
          existing={fakeValidation}
          basePath='/referral-program/test-rp/validations'
        />,
      )
      expect(screen.getByLabelText('Slug')).toHaveValue('chase-sapphire')
      expect(screen.getByLabelText('User Help Text')).toHaveValue('Existing help text')
    })

    it('calls updateReferralLinkValidation on submit', async () => {
      const updated = { ...fakeValidation, slug: 'chase-sapphire-updated' }
      mockUpdate.mockResolvedValueOnce({ validation: updated })

      render(
        <ValidationForm
          existing={fakeValidation}
          basePath='/referral-program/test-rp/validations'
        />,
      )

      fireEvent.change(screen.getByLabelText('Slug'), {
        target: { value: 'chase-sapphire-updated' },
      })
      fireEvent.submit(screen.getByRole('button', { name: /update/i }).closest('form')!)

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith('val-1', {
          slug: 'chase-sapphire-updated',
          user_help_text: 'Existing help text',
        })
      })
      expect(mockOnSuccess).toHaveBeenCalledWith('Validation updated')
    })

    it('calls onSaved callback with updated validation', async () => {
      const updated = { ...fakeValidation, slug: 'updated' }
      mockUpdate.mockResolvedValueOnce({ validation: updated })
      const onSaved = vi.fn<VitestLooseMock>()

      render(
        <ValidationForm
          existing={fakeValidation}
          onSaved={onSaved}
          basePath='/referral-program/test-rp/validations'
        />,
      )

      fireEvent.submit(screen.getByRole('button', { name: /update/i }).closest('form')!)

      await waitFor(() => {
        expect(onSaved).toHaveBeenCalledWith(updated)
      })
    })
  })
})
