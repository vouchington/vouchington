import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import {
  clearRuntimePublicConfigForTest,
  setRuntimePublicConfigForTest,
} from '@/test-helpers/runtime-public-config'

import type { ReactNode } from 'react'

import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { LoginForm } from '../login-form'

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

vi.mock(
  import('@/hooks/use-facebook-sdk'),
  () =>
    ({
      useFacebookSDK: () => ({ isAvailable: false }),
    }) as unknown as typeof import('@/hooks/use-facebook-sdk'),
)

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
    mockRouter.refresh.mockReset()
    mockRouter.replace.mockReset()
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
      expect(mockRouter.replace).toHaveBeenCalledWith('/')
      expect(mockRouter.refresh).toHaveBeenCalledTimes(1)
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
      expect(mockRouter.replace).not.toHaveBeenCalled()
      expect(mockRouter.refresh).not.toHaveBeenCalled()
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
