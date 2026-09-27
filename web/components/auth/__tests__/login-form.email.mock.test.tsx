import {
  mockContinueOAuthLogin,
  mockLoginWithEmailAddress,
  mockSendEmailLoginToken,
  turnstileCallbacks,
} from '@/test-helpers/components/auth/login-form.email.mock-support'

import { createNavMock } from '@/test-helpers/next-navigation-mock'

import {
  clearRuntimePublicConfigForTest,
  setRuntimePublicConfigForTest,
} from '@/test-helpers/runtime-public-config'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { LoginForm } from '../login-form'

vi.mock(import('../mfa-step'), () => ({
  default: () => <div data-testid='mfa-step' />,
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

  it('should render email input and continue button', () => {
    render(<LoginForm />)

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue with email/i })).toBeInTheDocument()
  })

  it('shows Terms of Service and Privacy Policy links', () => {
    render(<LoginForm />)

    const tosLink = screen.getByRole('link', { name: /terms of service/i })
    expect(tosLink).toBeInTheDocument()
    expect(tosLink).toHaveAttribute('href', '/article/terms-of-service')

    const privacyLink = screen.getByRole('link', { name: /privacy policy/i })
    expect(privacyLink).toBeInTheDocument()
    expect(privacyLink).toHaveAttribute('href', '/article/privacy-policy')
  })

  it('should render InputOTP with 8 slots after email submission', async () => {
    render(<LoginForm />)

    const emailInput = screen.getByLabelText(/email/i)
    fireEvent.change(emailInput, { target: { value: 'tests+test@voucha.ai' } })
    fireEvent.submit(emailInput.closest('form')!)

    await waitFor(() => {
      expect(mockSendEmailLoginToken).toHaveBeenCalledWith(
        'tests+test@voucha.ai',
        undefined,
        {
          hp_website: '',
          hp_phone: '',
        },
        'en',
      )
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument()
    })

    const otpInput = document.querySelector('[data-input-otp]')
    expect(otpInput).toBeInTheDocument()
    expect(otpInput).toHaveAttribute('maxlength', '8')
  })

  it('should disable the Log in button when fewer than 8 chars are entered', async () => {
    await renderAtCodeStep()

    const submitButton = screen.getByRole('button', { name: /log in/i })
    expect(submitButton).toBeDisabled()

    const otpInput = document.querySelector('[data-input-otp] input')!
    fireEvent.change(otpInput, { target: { value: 'ABCD' } })
    expect(submitButton).toBeDisabled()
  })

  it('should auto-submit when 8 hex chars are entered', async () => {
    await renderAtCodeStep()

    const otpInput = document.querySelector('[data-input-otp] input')!
    fireEvent.change(otpInput, { target: { value: 'ABCD1234' } })

    await waitFor(() => {
      expect(mockLoginWithEmailAddress).toHaveBeenCalledWith('tests+test@voucha.ai', 'ABCD1234', {
        hp_website: '',
        hp_phone: '',
      })
    })
  })

  it('should wait for user intent before auto-submitting an email login link', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)

    render(
      <LoginForm
        initialEmailAddress='tests+prefill@voucha.ai'
        initialOtp='abcd1234'
      />,
    )

    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument()
    expect(mockLoginWithEmailAddress).not.toHaveBeenCalled()

    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    window.dispatchEvent(new Event('focus'))

    await waitFor(() => {
      expect(mockLoginWithEmailAddress).toHaveBeenCalledTimes(1)
      expect(mockLoginWithEmailAddress).toHaveBeenCalledWith(
        'tests+prefill@voucha.ai',
        'ABCD1234',
        {
          hp_website: '',
          hp_phone: '',
        },
      )
    })
  })

  it('should start on the code step for email login links and auto-submit once', async () => {
    render(
      <LoginForm
        initialEmailAddress='tests+prefill@voucha.ai'
        initialOtp='abcd1234'
      />,
    )

    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument()
    // The email step is CSS-hidden (not unmounted) when starting on the code step,
    // so the Facebook button is in the DOM but inside a hidden wrapper.
    const facebookButton = await screen.findByRole('button', {
      name: /continue with facebook/i,
      hidden: true,
    })
    expect(facebookButton.closest('.hidden')).not.toBeNull()

    await waitFor(() => {
      expect(mockLoginWithEmailAddress).toHaveBeenCalledTimes(1)
      expect(mockLoginWithEmailAddress).toHaveBeenCalledWith(
        'tests+prefill@voucha.ai',
        'ABCD1234',
        {
          hp_website: '',
          hp_phone: '',
        },
      )
    })
  })
})
