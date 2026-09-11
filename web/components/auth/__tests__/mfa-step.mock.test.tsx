import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import MfaStep from '../mfa-step'

vi.mock(import('@simplewebauthn/browser'), () => ({
  startAuthentication: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client'), () => ({
  getMfaPasskeyOptions: vi.fn<VitestLooseMock>(),
  verifyMfaPasskey: vi.fn<VitestLooseMock>(),
  verifyMfaTotp: vi.fn<VitestLooseMock>(),
}))

import { verifyMfaTotp } from '@/lib/api/client'

const mockVerifyMfaTotp = vi.mocked(verifyMfaTotp)

const defaultProps = {
  loginAttemptId: 'test-attempt-id',
  onSuccess: vi.fn<VitestLooseMock>(),
  onBack: vi.fn<VitestLooseMock>(),
}

describe('MfaStep', () => {
  it('renders authenticator code input and action buttons', () => {
    render(<MfaStep {...defaultProps} />)
    expect(screen.getByLabelText(/authenticator code/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /use a passkey/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /back to login/i })).toBeInTheDocument()
  })

  it('focuses the TOTP input on mount', () => {
    render(<MfaStep {...defaultProps} />)
    expect(document.activeElement).toBe(screen.getByLabelText(/authenticator code/i))
  })

  it('submits the TOTP form when Enter is pressed in the code input', async () => {
    mockVerifyMfaTotp.mockResolvedValue({ user: { id: 'u1' } } as never)
    render(<MfaStep {...defaultProps} />)
    const input = screen.getByLabelText(/authenticator code/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: '123456' } })
    void expectInputEnterSubmits({ input, onSubmit: mockVerifyMfaTotp })
    await waitFor(() => {
      expect(mockVerifyMfaTotp).toHaveBeenCalledWith('test-attempt-id', '123456')
    })
  })
})
