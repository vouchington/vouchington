import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { LoginForm } from '../login-form'
import { resetFacebookSdkStateForTests } from '@/hooks/use-facebook-sdk'
import type { OAuthProvider } from '@/types/user'
import {
  clearRuntimePublicConfigForTest,
  setRuntimePublicConfigForTest,
} from '@/test-helpers/runtime-public-config'

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

const mockSendEmailLoginToken = vi.hoisted(() => vi.fn<VitestLooseMock>().mockResolvedValue({}))
const mockLoginWithEmailAddress = vi.hoisted(() =>
  vi.fn<VitestLooseMock>().mockResolvedValue({ user: {} }),
)
const mockContinueOAuthLogin = vi.hoisted(() => vi.fn<VitestLooseMock>().mockResolvedValue({}))
const mockGetConfiguredOAuthProviders = vi.hoisted(() =>
  vi.fn<VitestLooseMock>().mockResolvedValue({ providers: ['facebook'] }),
)
vi.mock(import('@/lib/api/client'), () => ({
  continueOAuthLogin: mockContinueOAuthLogin,
  getConfiguredOAuthProviders: mockGetConfiguredOAuthProviders,
  loginWithEmailAddress: mockLoginWithEmailAddress,
  sendEmailLoginToken: mockSendEmailLoginToken,
}))

vi.mock(import('@/hooks/use-facebook-sdk'), async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/use-facebook-sdk')>()
  return {
    ...actual,
    useFacebookSDK: () => ({ isAvailable: false }),
  } as unknown as typeof import('@/hooks/use-facebook-sdk')
})

// Render a plain button that calls onToken on click so we can test the OAuth flow.
vi.mock(import('../oauth-login-button'), () => ({
  OAuthLoginButton: ({
    provider,
    onToken,
    disabled,
  }: {
    provider: OAuthProvider
    onToken: (token: any) => Promise<void>
    disabled?: boolean
  }) => (
    <button
      type='button'
      disabled={disabled}
      onClick={() => void onToken({ provider: provider as any, token: 'mock-token' })}
    >{`Continue with ${provider}`}</button>
  ),
}))

// Capture onSuccess and reset so tests can simulate Turnstile resolution and verify reset behavior
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

describe('LoginForm OAuth', () => {
  beforeEach(() => {
    setRuntimePublicConfigForTest({ facebookAppId: 'test-fb-app-id' })
    mockSendEmailLoginToken.mockReset()
    mockSendEmailLoginToken.mockResolvedValue({})
    mockLoginWithEmailAddress.mockReset()
    mockLoginWithEmailAddress.mockResolvedValue({ user: {} })
    mockContinueOAuthLogin.mockReset()
    mockContinueOAuthLogin.mockResolvedValue({})
    mockGetConfiguredOAuthProviders.mockReset()
    mockGetConfiguredOAuthProviders.mockResolvedValue({ providers: ['facebook'] })
    mockRouter.refresh.mockReset()
    mockRouter.replace.mockReset()
    turnstileCallbacks.reset.mockReset()
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  })

  afterEach(() => {
    resetFacebookSdkStateForTests()
    clearRuntimePublicConfigForTest()
    vi.restoreAllMocks()
  })

  it('should redirect to / after successful OAuth login', async () => {
    render(<LoginForm />)

    const facebookButton = await screen.findByRole('button', { name: /continue with facebook/i })
    fireEvent.click(facebookButton)

    await waitFor(() => {
      expect(mockContinueOAuthLogin).toHaveBeenCalled()
      expect(mockRouter.replace).toHaveBeenCalledWith('/')
      expect(mockRouter.refresh).toHaveBeenCalledTimes(1)
      expect(facebookButton).toBeDisabled()
    })
  })

  it('should call custom onLoginSuccess after successful OAuth login', async () => {
    const onLoginSuccess = vi.fn<VitestLooseMock>()
    render(<LoginForm onLoginSuccess={onLoginSuccess} />)

    const facebookButton = await screen.findByRole('button', { name: /continue with facebook/i })
    fireEvent.click(facebookButton)

    await waitFor(() => {
      expect(mockContinueOAuthLogin).toHaveBeenCalled()
      expect(onLoginSuccess).toHaveBeenCalledTimes(1)
      expect(mockRouter.replace).not.toHaveBeenCalled()
      expect(mockRouter.refresh).not.toHaveBeenCalled()
    })
  })

  describe('Turnstile (always enabled)', () => {
    beforeEach(() => {
      turnstileCallbacks.onSuccess = undefined
    })

    it('disables submit button until Turnstile resolves', () => {
      render(<LoginForm />)
      const btn = screen.getByRole('button', { name: /continue with email/i })
      expect(btn).toBeDisabled()
    })

    it('enables submit button after Turnstile resolves', async () => {
      render(<LoginForm />)
      const btn = screen.getByRole('button', { name: /continue with email/i })
      expect(btn).toBeDisabled()

      act(() => {
        turnstileCallbacks.onSuccess?.('test-captcha-token')
      })
      await waitFor(() => expect(btn).not.toBeDisabled())
    })

    it('passes Turnstile token to sendEmailLoginToken', async () => {
      render(<LoginForm />)
      act(() => {
        turnstileCallbacks.onSuccess?.('test-captcha-token')
      })

      const emailInput = screen.getByLabelText(/email/i)
      fireEvent.change(emailInput, { target: { value: 'tests+test@voucha.ai' } })
      fireEvent.submit(emailInput.closest('form')!)

      await waitFor(() => {
        expect(mockSendEmailLoginToken).toHaveBeenCalledWith(
          'tests+test@voucha.ai',
          'test-captcha-token',
          { hp_website: '', hp_phone: '' },
          'en',
        )
      })
    })

    it('should not reset Turnstile on email submit error', async () => {
      mockSendEmailLoginToken.mockRejectedValue(new Error('Too many requests'))
      render(<LoginForm />)

      act(() => {
        turnstileCallbacks.onSuccess?.('test-captcha-token')
      })

      const emailInput = screen.getByLabelText(/email/i)
      fireEvent.change(emailInput, { target: { value: 'tests+test@voucha.ai' } })
      fireEvent.submit(emailInput.closest('form')!)

      await waitFor(() => expect(mockSendEmailLoginToken).toHaveBeenCalled())

      // Turnstile token should NOT be reset on submit error — it stays valid for retry
      expect(turnstileCallbacks.reset).not.toHaveBeenCalled()
    })

    it('should reset Turnstile widget on successful email submit', async () => {
      render(<LoginForm />)

      act(() => {
        turnstileCallbacks.onSuccess?.('test-captcha-token')
      })

      const emailInput = screen.getByLabelText(/email/i)
      fireEvent.change(emailInput, { target: { value: 'tests+test@voucha.ai' } })
      fireEvent.submit(emailInput.closest('form')!)

      await waitFor(() => expect(mockSendEmailLoginToken).toHaveBeenCalled())

      // Widget must reset after a successful email submit so a fresh token
      // can be acquired for the Resend code button on the code step.
      expect(turnstileCallbacks.reset).toHaveBeenCalledTimes(1)
    })
  })
})

describe('LoginForm — OAuth provider visibility', () => {
  afterEach(() => {
    resetFacebookSdkStateForTests()
    clearRuntimePublicConfigForTest()
  })

  it('renders Facebook login button when runtime public config includes a Facebook app ID', async () => {
    setRuntimePublicConfigForTest({ facebookAppId: 'test-fb-app-id' })
    mockGetConfiguredOAuthProviders.mockResolvedValue({ providers: ['facebook'] })

    render(<LoginForm />)

    expect(
      await screen.findByRole('button', { name: /continue with facebook/i }),
    ).toBeInTheDocument()
  })

  it('hides Facebook login button without a runtime public Facebook app ID', async () => {
    mockGetConfiguredOAuthProviders.mockResolvedValue({ providers: ['facebook'] })
    render(<LoginForm />)

    const facebookButton = screen.queryByRole('button', { name: /continue with facebook/i })
    expect(facebookButton).not.toBeInTheDocument()
  })

  it('renders a broker-enabled provider without a browser-visible client ID', async () => {
    mockGetConfiguredOAuthProviders.mockResolvedValue({
      providers: ['github'],
      broker_capabilities: {
        github: {
          version: 1,
          modes: { web: true, native: false },
          purposes: ['authenticate', 'connect'],
        },
      },
    })

    render(<LoginForm />)

    expect(await screen.findByRole('button', { name: /continue with github/i })).toBeInTheDocument()
  })

  it('hides providers that the backend does not report as configured', async () => {
    setRuntimePublicConfigForTest({
      facebookAppId: 'test-fb-app-id',
      githubClientId: 'test-github-client-id',
    })
    mockGetConfiguredOAuthProviders.mockResolvedValue({ providers: ['github'] })

    render(<LoginForm />)

    expect(await screen.findByRole('button', { name: /continue with github/i })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /continue with facebook/i }),
    ).not.toBeInTheDocument()
  })
})
