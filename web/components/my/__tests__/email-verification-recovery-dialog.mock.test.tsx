import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FormEvent } from 'react'
import { EmailVerificationRecoveryDialog } from '../email-verification-recovery-dialog'
import { useFreshAuthenticationMock } from '@/test-helpers/components/my/mfa-reauth-dialog.mock-support'

type AddEmailFormMockProps = {
  newEmail: string
  onCancel: () => void
  onRequestVerification: (event: FormEvent) => void
  setNewEmail: (email: string) => void
}

type VerifyEmailFormMockProps = {
  onCancel: () => void
  submitVerify: (token: string) => void
}

const { onErrorMock, requestMock, verifyMock, authenticateMock } = vi.hoisted(() => ({
  onErrorMock: vi.fn<VitestLooseMock>(),
  requestMock: vi.fn<VitestLooseMock>(),
  verifyMock: vi.fn<VitestLooseMock>(),
  authenticateMock: vi.fn<() => Promise<string | null>>(),
}))

vi.mock(import('../use-fresh-authentication'), () => ({
  useFreshAuthentication: () => ({
    ...useFreshAuthenticationMock(),
    requestAuthentication: authenticateMock,
  }),
}))
vi.mock(import('../mfa-reauth-dialog'), () => ({ MfaReauthDialog: () => <span hidden /> }))

vi.mock(import('@/lib/api/client'), () => ({
  requestMyEmailAddressVerification: requestMock,
  verifyMyEmailAddress: verifyMock,
}))
vi.mock(import('@/lib/on-error'), () => ({ default: onErrorMock }))
vi.mock(import('../email-manager/add-email-form'), () => ({
  AddEmailForm: ({
    newEmail,
    onCancel,
    onRequestVerification,
    setNewEmail,
  }: AddEmailFormMockProps) => (
    <form onSubmit={onRequestVerification}>
      <span>{newEmail}</span>
      <button
        type='button'
        onClick={() => setNewEmail('Tests+Recovery@Voucha.ai')}
      >
        Set email
      </button>
      <button type='submit'>Request</button>
      <button
        type='button'
        onClick={onCancel}
      >
        Cancel
      </button>
    </form>
  ),
}))
vi.mock(import('../email-manager/verify-email-form'), () => ({
  VerifyEmailForm: ({ onCancel, submitVerify }: VerifyEmailFormMockProps) => (
    <div>
      <button
        type='button'
        onClick={() => submitVerify('ABCDEFG234')}
      >
        Verify
      </button>
      <button
        type='button'
        onClick={onCancel}
      >
        Cancel verification
      </button>
    </div>
  ),
}))

describe('EmailVerificationRecoveryDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateMock.mockResolvedValue('fresh-proof')
  })

  it('requests the normalized address and completes verification', async () => {
    requestMock.mockResolvedValue({ email_address: 'tests+recovery@voucha.ai' })
    verifyMock.mockResolvedValue({ results: [] })
    const onVerified = vi.fn<VitestLooseMock>()
    render(
      <EmailVerificationRecoveryDialog
        open
        onOpenChange={vi.fn<(open: boolean) => void>()}
        onVerified={onVerified}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Set email' }))
    await screen.findByText('Tests+Recovery@Voucha.ai')
    fireEvent.click(screen.getByRole('button', { name: 'Request' }))
    await screen.findByRole('button', { name: 'Verify' })
    expect(requestMock).toHaveBeenCalledWith('Tests+Recovery@Voucha.ai', 'fresh-proof')
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
    await waitFor(() =>
      expect(verifyMock).toHaveBeenCalledWith(
        'tests+recovery@voucha.ai',
        'ABCDEFG234',
        'fresh-proof',
      ),
    )
    expect(onVerified).toHaveBeenCalledOnce()
    expect(authenticateMock).toHaveBeenCalledTimes(2)
  })

  it('leaves email recovery untouched when confirmation is cancelled', async () => {
    authenticateMock.mockResolvedValueOnce(null)
    render(
      <EmailVerificationRecoveryDialog
        open
        onOpenChange={() => {}}
        onVerified={() => {}}
      />,
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Request' }))
    })
    expect(authenticateMock).toHaveBeenCalledOnce()
    expect(requestMock).not.toHaveBeenCalled()
    expect(verifyMock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Request' })).toBeInTheDocument()
  })

  it('reports request and verification failures and supports cancellation', async () => {
    requestMock.mockRejectedValueOnce(new Error('request failed'))
    const onOpenChange = vi.fn<VitestLooseMock>()
    render(
      <EmailVerificationRecoveryDialog
        open
        onOpenChange={onOpenChange}
        onVerified={vi.fn<() => void>()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Request' }))
    await waitFor(() => expect(onErrorMock).toHaveBeenCalledOnce())

    requestMock.mockResolvedValueOnce({ email_address: 'tests+recovery@voucha.ai' })
    fireEvent.click(screen.getByRole('button', { name: 'Request' }))
    await screen.findByRole('button', { name: 'Verify' })
    verifyMock.mockRejectedValueOnce(new Error('invalid'))
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
    await waitFor(() => expect(onErrorMock).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel verification' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
