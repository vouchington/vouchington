import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
const mockContinueOAuthLogin = vi.hoisted(() => vi.fn<VitestLooseMock>())
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

vi.mock(import('@/hooks/use-turnstile'), () => ({
  useTurnstile: () => ({ ref: () => {}, reset: vi.fn<VitestLooseMock>(), isError: false }),
}))

vi.mock(import('../mfa-step'), () => ({
  default: () => <div data-testid='mfa-step' />,
}))

const { toastMock } = vi.hoisted(() => {
  const mock = Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
  })
  return { toastMock: mock }
})

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: toastMock,
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/on-error'), () => ({
  default: (err: unknown, options: { fallback: string }) => {
    toastMock.error(options.fallback)
    return options.fallback
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

import { LoginForm } from '../login-form'

describe('LoginForm — OAuth error fallback', () => {
  beforeEach(() => {
    setRuntimePublicConfigForTest({ facebookAppId: 'test-fb-app-id' })
    vi.clearAllMocks()
  })

  afterEach(() => {
    resetFacebookSdkStateForTests()
    clearRuntimePublicConfigForTest()
  })

  it('reports OAuth login failures via onError fallback', async () => {
    mockContinueOAuthLogin.mockRejectedValueOnce(new Error('OAuth failed'))

    render(<LoginForm />)
    fireEvent.click(await screen.findByRole('button', { name: /continue with facebook/i }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Unable to connect. Please try again.')
    })
  })
})
