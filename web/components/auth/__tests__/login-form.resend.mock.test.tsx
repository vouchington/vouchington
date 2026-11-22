import {
  mockSendEmailLoginToken,
  turnstileCallbacks,
} from '@/test-helpers/components/auth/login-form.email.mock-support'
import { ApiError } from '@vouchington/api-client'
import { createNavMock } from 'vouchington-tooling/next-navigation-mock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { LoginForm } from '../login-form'

vi.mock(import('../mfa-step'), () => ({
  default: () => <div data-testid='mfa-step' />,
}))

createNavMock()

function submitEmail() {
  const emailInput = screen.getByLabelText(/email/i)
  fireEvent.change(emailInput, { target: { value: 'tests+test@voucha.ai' } })
  return emailInput.closest('form')!
}

async function renderAtCodeStep(sendResult: unknown) {
  mockSendEmailLoginToken.mockResolvedValueOnce(sendResult)
  render(<LoginForm />)
  fireEvent.submit(submitEmail())
  await screen.findByLabelText(/verification code/i)
  act(() => turnstileCallbacks.onSuccess?.('turnstile-token'))
}

describe('LoginForm email code spacing', () => {
  beforeEach(() => {
    mockSendEmailLoginToken.mockReset()
    turnstileCallbacks.reset.mockReset()
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends one code when the email form is submitted twice in the same tick', async () => {
    mockSendEmailLoginToken.mockResolvedValue({ email_address: 'a@b.test' })
    render(<LoginForm />)
    const form = submitEmail()
    fireEvent.submit(form)
    fireEvent.submit(form)
    await screen.findByLabelText(/verification code/i)
    expect(mockSendEmailLoginToken).toHaveBeenCalledTimes(1)
  })

  it('disables resend with the server interval after a successful send', async () => {
    await renderAtCodeStep({ email_address: 'a@b.test', resend_after_seconds: 60 })
    expect(screen.getByRole('button', { name: 'Resend in 60s' })).toBeDisabled()
  })

  it('keeps resend enabled when the server sends no interval', async () => {
    await renderAtCodeStep({ email_address: 'a@b.test' })
    expect(screen.getByRole('button', { name: /resend code/i })).toBeEnabled()
  })

  it('starts the countdown from retry_after when resend is rate limited', async () => {
    await renderAtCodeStep({ email_address: 'a@b.test' })
    mockSendEmailLoginToken.mockRejectedValueOnce(
      new ApiError('Too Many Requests', 429, { retry_after: 17 }),
    )
    fireEvent.click(screen.getByRole('button', { name: /resend code/i }))
    expect(await screen.findByRole('button', { name: 'Resend in 17s' })).toBeDisabled()
  })

  it('moves to the code step with the countdown when a code was already sent', async () => {
    mockSendEmailLoginToken.mockRejectedValueOnce(
      new ApiError('Please wait', 429, { retry_after: 42, code: 'email_code_recently_sent' }),
    )
    render(<LoginForm />)
    fireEvent.submit(submitEmail())
    await screen.findByLabelText(/verification code/i)
    expect(await screen.findByRole('button', { name: 'Resend in 42s' })).toBeDisabled()
    expect(turnstileCallbacks.reset).toHaveBeenCalled()
  })

  it('stays on the email step for other rate limits and still spends the CAPTCHA token', async () => {
    mockSendEmailLoginToken.mockRejectedValueOnce(
      new ApiError('Too Many Requests', 429, { retry_after: 5 }),
    )
    render(<LoginForm />)
    fireEvent.submit(submitEmail())
    await vi.waitFor(() => expect(turnstileCallbacks.reset).toHaveBeenCalled())
    expect(screen.queryByLabelText(/verification code/i)).toBeNull()
  })
})
