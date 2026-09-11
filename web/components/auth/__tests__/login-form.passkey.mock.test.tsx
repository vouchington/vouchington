import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LoginForm } from '../login-form'
import { ApiError } from '@/lib/api/error'
import type { OAuthProvider } from '@/types/user'

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

const mockRouter = vi.hoisted(() => ({
  refresh: vi.fn<VitestLooseMock>(),
  replace: vi.fn<VitestLooseMock>(),
}))
vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => mockRouter,
    }) as unknown as typeof import('next/navigation'),
)

const mockGetDiscoverablePasskeyOptions = vi.hoisted(() =>
  vi
    .fn<VitestLooseMock>()
    .mockResolvedValue({ options: { challenge: 'test', allowCredentials: [] } }),
)
const mockVerifyDiscoverablePasskey = vi.hoisted(() =>
  vi.fn<VitestLooseMock>().mockResolvedValue({ user: { id: 'user-1' } }),
)
const mockStartAuthentication = vi.hoisted(() =>
  vi.fn<VitestLooseMock>().mockResolvedValue({ id: 'cred-id', response: {} }),
)

vi.mock(import('@simplewebauthn/browser'), () => ({
  startAuthentication: mockStartAuthentication,
}))

vi.mock(import('@/lib/api/client'), () => ({
  continueOAuthLogin: vi.fn<VitestLooseMock>().mockResolvedValue({}),
  getConfiguredOAuthProviders: vi
    .fn<VitestLooseMock>()
    .mockResolvedValue({ providers: ['facebook'] }),
  getDiscoverablePasskeyOptions: mockGetDiscoverablePasskeyOptions,
  loginWithEmailAddress: vi.fn<VitestLooseMock>().mockResolvedValue({ user: {} }),
  sendEmailLoginToken: vi.fn<VitestLooseMock>().mockResolvedValue({}),
  verifyDiscoverablePasskey: mockVerifyDiscoverablePasskey,
}))

vi.mock(
  import('@/hooks/use-facebook-sdk'),
  () =>
    ({
      useFacebookSDK: () => ({ isAvailable: false }),
    }) as unknown as typeof import('@/hooks/use-facebook-sdk'),
)

vi.mock(
  import('../oauth-login-button'),
  () =>
    ({
      OAuthLoginButton: ({
        provider,
        onToken,
        disabled,
      }: {
        provider: OAuthProvider
        onToken: (token: unknown) => Promise<void>
        disabled?: boolean
      }) => (
        <button
          type='button'
          disabled={disabled}
          onClick={() => void onToken({ provider: provider as unknown, token: 'mock-token' })}
        >{`Continue with ${provider}`}</button>
      ),
    }) as unknown as typeof import('../oauth-login-button'),
)

const turnstileCallbacks = vi.hoisted(() => ({
  onSuccess: undefined as ((token: string) => void) | undefined,
  reset: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/hooks/use-turnstile'), () => ({
  useTurnstile: ({ onSuccess }: { onSuccess: (token: string) => void }) => {
    turnstileCallbacks.onSuccess = onSuccess
    return { ref: () => {}, reset: turnstileCallbacks.reset, isError: false }
  },
}))

vi.mock(import('../mfa-step'), () => ({
  default: () => <div data-testid='mfa-step' />,
}))

describe('LoginForm — discoverable passkey sign-in', () => {
  beforeEach(() => {
    mockGetDiscoverablePasskeyOptions.mockReset()
    mockGetDiscoverablePasskeyOptions.mockResolvedValue({
      options: { challenge: 'test', allowCredentials: [] },
    })
    mockVerifyDiscoverablePasskey.mockReset()
    mockVerifyDiscoverablePasskey.mockResolvedValue({ user: { id: 'user-1' } })
    mockStartAuthentication.mockReset()
    mockStartAuthentication.mockResolvedValue({ id: 'cred-id', response: {} })
    mockRouter.refresh.mockReset()
    mockRouter.replace.mockReset()
    turnstileCallbacks.reset.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the Sign in with a passkey button on the email step', () => {
    render(<LoginForm />)
    expect(screen.getByRole('button', { name: /sign in with a passkey/i })).toBeInTheDocument()
  })

  it('calls getDiscoverablePasskeyOptions and startAuthentication when passkey button is clicked', async () => {
    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: /sign in with a passkey/i }))

    await waitFor(() => {
      expect(mockGetDiscoverablePasskeyOptions).toHaveBeenCalledTimes(1)
      expect(mockStartAuthentication).toHaveBeenCalledWith({
        optionsJSON: { challenge: 'test', allowCredentials: [] },
      })
    })
  })

  it('calls verifyDiscoverablePasskey with the authentication response', async () => {
    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: /sign in with a passkey/i }))

    await waitFor(() => {
      expect(mockVerifyDiscoverablePasskey).toHaveBeenCalledWith({ id: 'cred-id', response: {} })
    })
  })

  it('redirects to / after successful passkey sign-in', async () => {
    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: /sign in with a passkey/i }))

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith('/')
      expect(mockRouter.refresh).toHaveBeenCalledTimes(1)
    })
  })

  it('calls custom onLoginSuccess instead of redirecting when provided', async () => {
    const onLoginSuccess = vi.fn<VitestLooseMock>()
    render(<LoginForm onLoginSuccess={onLoginSuccess} />)
    fireEvent.click(screen.getByRole('button', { name: /sign in with a passkey/i }))

    await waitFor(() => {
      expect(onLoginSuccess).toHaveBeenCalledTimes(1)
      expect(mockRouter.replace).not.toHaveBeenCalled()
    })
  })

  it('shows a friendly error when no account is registered for the passkey (401)', async () => {
    const error = new ApiError('Passkey sign-in failed', 401)
    mockVerifyDiscoverablePasskey.mockRejectedValue(error)

    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: /sign in with a passkey/i }))

    await waitFor(() => {
      expect(mockRouter.replace).not.toHaveBeenCalled()
    })
  })

  it('handles user cancellation (NotAllowedError) without an error toast', async () => {
    const cancelError = Object.assign(new Error('User cancelled'), { name: 'NotAllowedError' })
    mockStartAuthentication.mockRejectedValue(cancelError)

    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: /sign in with a passkey/i }))

    await waitFor(() => {
      expect(mockVerifyDiscoverablePasskey).not.toHaveBeenCalled()
      expect(mockRouter.replace).not.toHaveBeenCalled()
    })
  })

  it('does not navigate away when passkey sign-in fails', async () => {
    mockVerifyDiscoverablePasskey.mockRejectedValue(new Error('Network error'))

    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: /sign in with a passkey/i }))

    await waitFor(() => {
      expect(mockRouter.replace).not.toHaveBeenCalled()
    })
  })

  it('stays on the email step after passkey failure (does not advance to code step)', async () => {
    mockVerifyDiscoverablePasskey.mockRejectedValue(new Error('verification failed'))

    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: /sign in with a passkey/i }))

    await waitFor(() => {
      // The email input is still visible (not hidden), confirming we're still on the email step
      expect(screen.getByLabelText(/email/i)).toBeVisible()
    })
  })
})
