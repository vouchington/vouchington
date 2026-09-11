'use client'

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import { LoginCodeStep } from './login-code-step'

const baseProps = {
  active: true,
  code: '',
  email: 'tests+test@voucha.ai',
  loading: false,
  onBack: vi.fn<VitestLooseMock>(),
  onCodeChange: vi.fn<VitestLooseMock>(),
  onResendCode: vi.fn<VitestLooseMock>(),
  onSubmit: vi.fn<VitestLooseMock>(),
  turnstileReady: true,
}

describe('LoginCodeStep', () => {
  it('renders form elements when active', () => {
    render(<LoginCodeStep {...baseProps} />)
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument()
  })

  it('returns null when not active', () => {
    const { container } = render(
      <LoginCodeStep
        {...baseProps}
        active={false}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders OTP slots with a decorative separator', () => {
    const { container } = render(<LoginCodeStep {...baseProps} />)
    const customSizedSlots = container.querySelectorAll('[class*="h-8"][class*="w-8"]')
    const decorativeSeparator = container.querySelector('[aria-hidden="true"] svg')
    expect(customSizedSlots.length).toBe(0)
    expect(decorativeSeparator).not.toBeNull()
    expect(screen.queryByRole('separator')).toBeNull()
  })

  it('focuses the OTP input on mount when active', () => {
    render(<LoginCodeStep {...baseProps} />)
    // The mock OTPInput renders a real <input> and forwards the ref, so after mount
    // the useEffect should move focus into the first input slot.
    expect(document.activeElement?.tagName).toBe('INPUT')
  })

  it('does not render (and therefore does not steal focus) when inactive', () => {
    const { container } = render(
      <LoginCodeStep
        {...baseProps}
        active={false}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders Resend code button', () => {
    render(<LoginCodeStep {...baseProps} />)
    expect(screen.getByRole('button', { name: /resend code/i })).toBeInTheDocument()
  })

  it('calls onResendCode when Resend code is clicked', () => {
    const onResendCode = vi.fn<VitestLooseMock>()
    render(
      <LoginCodeStep
        {...baseProps}
        onResendCode={onResendCode}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /resend code/i }))
    expect(onResendCode).toHaveBeenCalledTimes(1)
  })

  it('disables Resend code button while loading', () => {
    render(
      <LoginCodeStep
        {...baseProps}
        loading
      />,
    )
    expect(screen.getByRole('button', { name: /resend code/i })).toBeDisabled()
  })

  it('disables Resend code button when turnstile not ready', () => {
    render(
      <LoginCodeStep
        {...baseProps}
        turnstileReady={false}
      />,
    )
    expect(screen.getByRole('button', { name: /resend code/i })).toBeDisabled()
  })

  it('submits on Enter from the OTP input (form-keyboard convention)', () => {
    const onSubmit = vi.fn<VitestLooseMock>()
    render(
      <LoginCodeStep
        {...baseProps}
        onSubmit={onSubmit}
      />,
    )
    // Mocked OTPInput renders a real <input> inside the form.
    const input = screen.getByLabelText(/verification code/i) as HTMLInputElement
    void expectInputEnterSubmits({ input, onSubmit })
  })
})
