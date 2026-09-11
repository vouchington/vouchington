import { describe, it, expect, vi } from 'vitest'
import { createRef, type ReactNode } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import type { OAuthProvider } from '@/types/user'
import { LoginEmailStep } from './login-email-step'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: ReactNode
        href: string
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('./oauth-login-button'), () => ({
  OAuthLoginButton: ({ provider }: { provider: OAuthProvider }) => (
    <button type='button'>{`Continue with ${provider}`}</button>
  ),
}))

const defaultProps = {
  active: true,
  email: '',
  hasOAuthProviders: false,
  hpPhoneRef: createRef<HTMLInputElement | null>(),
  hpWebsiteRef: createRef<HTMLInputElement | null>(),
  loading: false,
  oauthProviders: [] as OAuthProvider[],
  onEmailChange: vi.fn<VitestLooseMock>(),
  onOAuthToken: vi.fn<VitestLooseMock>(),
  onPasskeySignIn: vi.fn<VitestLooseMock>(),
  onSubmit: vi.fn<VitestLooseMock>(),
  turnstileRef: vi.fn<VitestLooseMock>(),
  turnstileToken: null,
}

describe('LoginEmailStep', () => {
  it('renders email input and submit button', () => {
    render(<LoginEmailStep {...defaultProps} />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue with email/i })).toBeInTheDocument()
  })

  it('renders Terms of Service link with correct href', () => {
    render(<LoginEmailStep {...defaultProps} />)
    const tosLink = screen.getByRole('link', { name: /terms of service/i })
    expect(tosLink).toHaveAttribute('href', '/article/terms-of-service')
  })

  it('renders Privacy Policy link with correct href', () => {
    render(<LoginEmailStep {...defaultProps} />)
    const privacyLink = screen.getByRole('link', { name: /privacy policy/i })
    expect(privacyLink).toHaveAttribute('href', '/article/privacy-policy')
  })

  it('hides content when active is false', () => {
    render(
      <LoginEmailStep
        {...defaultProps}
        active={false}
      />,
    )
    expect(screen.getByLabelText(/email/i).closest('.hidden')).not.toBeNull()
  })

  it('calls onEmailChange when email input changes', () => {
    const onEmailChange = vi.fn<VitestLooseMock>()
    render(
      <LoginEmailStep
        {...defaultProps}
        onEmailChange={onEmailChange}
      />,
    )
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'tests+test@voucha.ai' } })
    expect(onEmailChange).toHaveBeenCalledWith('tests+test@voucha.ai')
  })

  it('disables submit button and shows sending state when loading', () => {
    render(
      <LoginEmailStep
        {...defaultProps}
        loading
      />,
    )
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled()
  })

  it('hides the widget and enables continue when always-approve is on', () => {
    render(
      <LoginEmailStep
        {...defaultProps}
        turnstileAlwaysApprove
        turnstileToken='turnstile-always-approve'
      />,
    )
    expect(document.querySelector('[data-pw="login-turnstile-container"]')).toBeNull()
    expect(screen.getByRole('button', { name: /continue with email/i })).toBeEnabled()
  })

  it('focuses the email input when active', () => {
    render(<LoginEmailStep {...defaultProps} />)
    expect(document.activeElement).toBe(screen.getByLabelText(/email/i))
  })

  it('submits the form when Enter is pressed in the email input', () => {
    const onSubmit = vi.fn<VitestLooseMock>()
    render(
      <LoginEmailStep
        {...defaultProps}
        onSubmit={onSubmit}
      />,
    )
    const input = screen.getByLabelText(/email/i) as HTMLInputElement
    void expectInputEnterSubmits({ input, onSubmit })
  })

  it('renders Sign in with a passkey button', () => {
    render(<LoginEmailStep {...defaultProps} />)
    expect(screen.getByRole('button', { name: /sign in with a passkey/i })).toBeInTheDocument()
  })

  it('calls onPasskeySignIn when the passkey button is clicked', () => {
    const onPasskeySignIn = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    render(
      <LoginEmailStep
        {...defaultProps}
        onPasskeySignIn={onPasskeySignIn}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /sign in with a passkey/i }))
    expect(onPasskeySignIn).toHaveBeenCalledTimes(1)
  })

  it('disables the passkey button when loading', () => {
    render(
      <LoginEmailStep
        {...defaultProps}
        loading
      />,
    )
    expect(screen.getByRole('button', { name: /sign in with a passkey/i })).toBeDisabled()
  })

  it('re-focuses the email input when transitioning back to active', () => {
    const { rerender } = render(
      <LoginEmailStep
        {...defaultProps}
        active={false}
      />,
    )
    expect(document.activeElement).not.toBe(screen.getByLabelText(/email/i))
    rerender(
      <LoginEmailStep
        {...defaultProps}
        active
      />,
    )
    expect(document.activeElement).toBe(screen.getByLabelText(/email/i))
  })
})
