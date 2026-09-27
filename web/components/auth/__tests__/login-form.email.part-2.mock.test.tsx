import {
  mockContinueOAuthLogin,
  mockLoginWithEmailAddress,
  mockSendEmailLoginToken,
  turnstileCallbacks,
} from '@/test-helpers/components/auth/login-form.email.mock-support'

import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import { createNavMock } from '@/test-helpers/next-navigation-mock'

import {
  clearRuntimePublicConfigForTest,
  setRuntimePublicConfigForTest,
} from '@/test-helpers/runtime-public-config'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { LoginForm } from '../login-form'

vi.mock(import('../mfa-step'), () => ({
  default: ({ loginAttemptId, onBack }: { loginAttemptId: string; onBack: () => void }) => (
    <div data-testid='mfa-step'>
      <span>{loginAttemptId}</span>
      <button
        type='button'
        onClick={onBack}
      >
        Back to login
      </button>
    </div>
  ),
}))

const mockNav = createNavMock()

async function renderAtCodeStep() {
  const result = render(<LoginForm />)
  const emailInput = screen.getByLabelText(/email/i)
  fireEvent.change(emailInput, { target: { value: 'tests+test@voucha.ai' } })
  fireEvent.submit(emailInput.closest('form')!)
  await screen.findByLabelText(/verification code/i)
  return result
}

describe('LoginForm', () => {
  beforeEach(() => {
    setRuntimePublicConfigForTest({ facebookAppId: 'test-fb-app-id' })
    mockSendEmailLoginToken.mockReset()
    mockSendEmailLoginToken.mockResolvedValue({})
    mockLoginWithEmailAddress.mockReset()
    mockLoginWithEmailAddress.mockResolvedValue({ user: {} })
    mockContinueOAuthLogin.mockReset()
    mockContinueOAuthLogin.mockResolvedValue({})
    mockNav.refresh.mockReset()
    mockNav.replace.mockReset()
    turnstileCallbacks.reset.mockReset()
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  })

  afterEach(() => {
    clearRuntimePublicConfigForTest()
    vi.restoreAllMocks()
  })

  it('should redirect to / after successful email login', async () => {
    await renderAtCodeStep()

    const otpInput = document.querySelector('[data-input-otp] input')!
    fireEvent.change(otpInput, { target: { value: 'ABCD1234' } })

    await waitFor(() => {
      expect(mockNav.replace).toHaveBeenCalledWith('/')
      expect(mockNav.refresh).toHaveBeenCalledTimes(1)
    })
  })

  it('should call custom onLoginSuccess after successful email login', async () => {
    const onLoginSuccess = vi.fn<VitestLooseMock>()
    render(<LoginForm onLoginSuccess={onLoginSuccess} />)

    const emailInput = screen.getByLabelText(/email/i)
    fireEvent.change(emailInput, { target: { value: 'tests+test@voucha.ai' } })
    fireEvent.submit(emailInput.closest('form')!)
    await screen.findByLabelText(/verification code/i)

    const otpInput = document.querySelector('[data-input-otp] input')!
    fireEvent.change(otpInput, { target: { value: 'ABCD1234' } })

    await waitFor(() => {
      expect(onLoginSuccess).toHaveBeenCalledTimes(1)
      expect(mockNav.replace).not.toHaveBeenCalled()
      expect(mockNav.refresh).not.toHaveBeenCalled()
    })
  })

  it('should show OAuth buttons again after going back from the code step', async () => {
    render(
      <LoginForm
        initialEmailAddress='tests+prefill@voucha.ai'
        initialOtp='ABCD1234'
      />,
    )

    await screen.findByLabelText(/verification code/i)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue with facebook/i })).toBeInTheDocument()
  })

  it('clears hydrated broker MFA state when returning to login', async () => {
    render(<LoginForm initialLoginAttemptId='attempt-1' />)

    expect(await screen.findByTestId('mfa-step')).toHaveTextContent('attempt-1')
    fireEvent.click(screen.getByRole('button', { name: /back to login/i }))

    expect(screen.queryByTestId('mfa-step')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('submits the email step when Enter is pressed in the email input', async () => {
    render(<LoginForm />)
    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement
    fireEvent.change(emailInput, { target: { value: 'tests+enter@voucha.ai' } })
    void expectInputEnterSubmits({ input: emailInput, onSubmit: mockSendEmailLoginToken })
    await waitFor(() => {
      expect(mockSendEmailLoginToken).toHaveBeenCalled()
    })
  })

  it('should not submit a second time if already submitting', async () => {
    let resolveFirst!: () => void
    mockLoginWithEmailAddress.mockImplementation(
      () =>
        new Promise<object>(resolve => {
          resolveFirst = () => resolve({ user: {} })
        }),
    )

    await renderAtCodeStep()

    const otpInput = document.querySelector('[data-input-otp] input')!
    fireEvent.change(otpInput, { target: { value: 'ABCD1234' } })
    // submitting.current is now true (set synchronously before the first await in submitCode)
    // Fire a second change immediately — no await so no React re-render opportunity between them
    fireEvent.change(otpInput, { target: { value: 'ABCD1235' } })

    resolveFirst()

    await waitFor(() => {
      expect(mockLoginWithEmailAddress).toHaveBeenCalledTimes(1)
    })
  })
})
