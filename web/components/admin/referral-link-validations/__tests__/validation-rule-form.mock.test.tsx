import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ValidationRuleForm } from '../validation-rule-form'
import {
  createReferralLinkValidationRule,
  updateReferralLinkValidationRule,
  type ReferralLinkValidationRule,
} from '@/lib/api/client/referral-link-validations'
import onError, { onSuccess } from '@/lib/on-error'

vi.mock(import('@/lib/api/client/referral-link-validations'), () => ({
  createReferralLinkValidationRule: vi.fn<VitestLooseMock>(),
  updateReferralLinkValidationRule: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))

const mockCreate = vi.mocked(createReferralLinkValidationRule)
const mockUpdate = vi.mocked(updateReferralLinkValidationRule)
const mockOnError = vi.mocked(onError)
const mockOnSuccess = vi.mocked(onSuccess)

const fakeRule: ReferralLinkValidationRule = {
  id: 'rule-1',
  referral_program_link_validation_id: 'val-1',
  hostname: 'refer.chase.com',
  pathname: '/refer/%',
  is_referral_link_url: true,
  is_invalid_referral_link_url: false,
  user_error_text: null,
  example_urls: null,
}

describe('ValidationRuleForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('create mode: fills fields and submits, calls createReferralLinkValidationRule and onSuccess', async () => {
    mockCreate.mockResolvedValueOnce({ validation_rule: fakeRule })

    render(<ValidationRuleForm validationId='val-1' />)

    fireEvent.change(screen.getByLabelText('Hostname'), {
      target: { value: 'refer.chase.com' },
    })
    fireEvent.change(screen.getByLabelText('Pathname (SQL LIKE)'), {
      target: { value: '/refer/%' },
    })
    fireEvent.change(screen.getByLabelText('User Error Text'), {
      target: { value: 'This URL is not a valid referral link.' },
    })

    const form = screen.getByRole('button', { name: /add rule/i }).closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        'val-1',
        expect.objectContaining({
          hostname: 'refer.chase.com',
          pathname: '/refer/%',
          user_error_text: 'This URL is not a valid referral link.',
        }),
      )
    })
    expect(mockOnSuccess).toHaveBeenCalledWith('Rule created')
  })

  it('edit mode: pre-fills fields from existing rule, changes pathname, calls updateReferralLinkValidationRule', async () => {
    mockUpdate.mockResolvedValueOnce({ validation_rule: { ...fakeRule, pathname: '/new/%' } })

    render(
      <ValidationRuleForm
        validationId='val-1'
        existing={fakeRule}
      />,
    )

    fireEvent.change(screen.getByLabelText('Pathname (SQL LIKE)'), {
      target: { value: '/new/%' },
    })

    const form = screen.getByRole('button', { name: /update/i }).closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        'val-1',
        'rule-1',
        expect.objectContaining({
          hostname: 'refer.chase.com',
          pathname: '/new/%',
        }),
      )
    })
    expect(mockOnSuccess).toHaveBeenCalledWith('Rule updated')
  })

  it('calls onSaved callback with saved rule', async () => {
    mockCreate.mockResolvedValueOnce({ validation_rule: fakeRule })
    const onSaved = vi.fn<VitestLooseMock>()

    render(
      <ValidationRuleForm
        validationId='val-1'
        onSaved={onSaved}
      />,
    )

    fireEvent.change(screen.getByLabelText('Hostname'), {
      target: { value: 'refer.chase.com' },
    })
    fireEvent.change(screen.getByLabelText('Pathname (SQL LIKE)'), {
      target: { value: '/refer/%' },
    })
    fireEvent.change(screen.getByLabelText('User Error Text'), {
      target: { value: 'Error text' },
    })

    const form = screen.getByRole('button', { name: /add rule/i }).closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(fakeRule)
    })
  })

  it('error: calls onError when createReferralLinkValidationRule rejects', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Server error'))

    render(<ValidationRuleForm validationId='val-1' />)

    fireEvent.change(screen.getByLabelText('Hostname'), {
      target: { value: 'refer.chase.com' },
    })
    fireEvent.change(screen.getByLabelText('Pathname (SQL LIKE)'), {
      target: { value: '/refer/%' },
    })
    fireEvent.change(screen.getByLabelText('User Error Text'), {
      target: { value: 'Error text' },
    })

    const form = screen.getByRole('button', { name: /add rule/i }).closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(expect.any(Error), {
        fallback: 'Failed to save rule',
      })
    })
  })

  it('cancel: calls onCancel when Cancel button is clicked', () => {
    const onCancel = vi.fn<VitestLooseMock>()

    render(
      <ValidationRuleForm
        validationId='val-1'
        onCancel={onCancel}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('submit button is disabled when hostname is empty', () => {
    render(<ValidationRuleForm validationId='val-1' />)

    // Only fill pathname and userErrorText; leave hostname empty
    fireEvent.change(screen.getByLabelText('Pathname (SQL LIKE)'), {
      target: { value: '/refer/%' },
    })
    fireEvent.change(screen.getByLabelText('User Error Text'), {
      target: { value: 'Error text' },
    })

    expect(screen.getByRole('button', { name: /add rule/i })).toBeDisabled()
  })

  it('submit button is disabled when ruleType is block-non-referral and userErrorText is empty', () => {
    render(<ValidationRuleForm validationId='val-1' />)

    fireEvent.change(screen.getByLabelText('Hostname'), {
      target: { value: 'refer.chase.com' },
    })
    fireEvent.change(screen.getByLabelText('Pathname (SQL LIKE)'), {
      target: { value: '/refer/%' },
    })
    // userErrorText left empty — block-non-referral requires it

    expect(screen.getByRole('button', { name: /add rule/i })).toBeDisabled()
  })

  it('example URLs parsed from textarea (newline-separated) are sent as array', async () => {
    mockCreate.mockResolvedValueOnce({ validation_rule: fakeRule })

    render(<ValidationRuleForm validationId='val-1' />)

    fireEvent.change(screen.getByLabelText('Hostname'), {
      target: { value: 'refer.chase.com' },
    })
    fireEvent.change(screen.getByLabelText('Pathname (SQL LIKE)'), {
      target: { value: '/refer/%' },
    })
    fireEvent.change(screen.getByLabelText('User Error Text'), {
      target: { value: 'Error text' },
    })
    fireEvent.change(screen.getByLabelText('Example URLs (one per line)'), {
      target: {
        value: 'https://refer.chase.com/refer?ref=abc123\nhttps://refer.chase.com/refer?ref=xyz456',
      },
    })

    const form = screen.getByRole('button', { name: /add rule/i }).closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        'val-1',
        expect.objectContaining({
          example_urls: [
            'https://refer.chase.com/refer?ref=abc123',
            'https://refer.chase.com/refer?ref=xyz456',
          ],
        }),
      )
    })
  })
})
