import {
  mockContinueOAuthLogin,
  mockLoginWithEmailAddress,
  mockSendEmailLoginToken,
  turnstileCallbacks,
} from '@/test-helpers/components/auth/login-form.email.mock-support'

import { createNavMock } from 'vouchington-tooling/next-navigation-mock'

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

  it('should render InputOTP with 10 slots after email submission', async () => {
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
    expect(otpInput).toHaveAttribute('maxlength', '10')
  })

  it('should disable the Log in button when fewer than 10 chars are entered', async () => {
    await renderAtCodeStep()

    const submitButton = screen.getByRole('button', { name: /log in/i })
    expect(submitButton).toBeDisabled()

    const otpInput = document.querySelector('[data-input-otp] input')!
    fireEvent.change(otpInput, { target: { value: 'ABCD' } })
    expect(submitButton).toBeDisabled()
  })

  it('requires explicit submit after a complete base32 code is entered', async () => {
    await renderAtCodeStep()

    const otpInput = document.querySelector('[data-input-otp] input')!
    fireEvent.change(otpInput, { target: { value: 'ABCDEFG234' } })
    expect(mockLoginWithEmailAddress).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(mockLoginWithEmailAddress).toHaveBeenCalledWith('tests+test@voucha.ai', 'ABCDEFG234', {
        hp_website: '',
        hp_phone: '',
      })
    })
  })

  it('does not submit a prefilled email code on focus or visibility changes', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)

    render(
      <LoginForm
        initialEmailAddress='tests+prefill@voucha.ai'
        initialOtp='abcdefg234'
      />,
    )

    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument()
    expect(mockLoginWithEmailAddress).not.toHaveBeenCalled()

    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(mockLoginWithEmailAddress).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(mockLoginWithEmailAddress).toHaveBeenCalledTimes(1)
      expect(mockLoginWithEmailAddress).toHaveBeenCalledWith(
        'tests+prefill@voucha.ai',
        'ABCDEFG234',
        {
          hp_website: '',
          hp_phone: '',
        },
      )
    })
  })

  it('starts on the prefilled code step and submits once after Log in is clicked', async () => {
    render(
      <LoginForm
        initialEmailAddress='tests+prefill@voucha.ai'
        initialOtp='abcdefg234'
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
    expect(mockLoginWithEmailAddress).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(mockLoginWithEmailAddress).toHaveBeenCalledTimes(1)
      expect(mockLoginWithEmailAddress).toHaveBeenCalledWith(
        'tests+prefill@voucha.ai',
        'ABCDEFG234',
        {
          hp_website: '',
          hp_phone: '',
        },
      )
    })
  })
})
