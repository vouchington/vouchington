import type { ReactNode } from 'react'
import { vi } from 'vitest'
import { Button } from '@/components/ui/button'
import { navMockModule } from '@/test-helpers/next-navigation-mock'
import type { OAuthProvider } from '@/types/user'
import type { OAuthLoginToken } from '@/lib/auth/oauth-login-token'

const mockContinueOAuthLogin = vi.hoisted(() => vi.fn<VitestLooseMock>().mockResolvedValue({}))
const mockGetConfiguredOAuthProviders = vi.hoisted(() =>
  vi.fn<VitestLooseMock>().mockResolvedValue({ providers: ['facebook'] }),
)
const mockLoginWithEmailAddress = vi.hoisted(() =>
  vi.fn<VitestLooseMock>().mockResolvedValue({ user: {} }),
)
const mockSendEmailLoginToken = vi.hoisted(() => vi.fn<VitestLooseMock>().mockResolvedValue({}))
const turnstileCallbacks = vi.hoisted(() => ({
  onSuccess: undefined as ((token: string) => void) | undefined,
  reset: vi.fn<VitestLooseMock>(),
}))

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

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
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

vi.mock(
  import('../../../components/auth/oauth-login-button'),
  () =>
    ({
      OAuthLoginButton: ({
        provider,
        onToken,
        disabled,
      }: {
        provider: OAuthProvider
        onToken: (token: OAuthLoginToken) => Promise<void>
        disabled?: boolean
      }) => (
        <Button
          type='button'
          disabled={disabled}
          onClick={() =>
            void onToken({ provider, token: 'mock-token' } as unknown as OAuthLoginToken)
          }
        >{`Continue with ${provider}`}</Button>
      ),
    }) as unknown as typeof import('../../../components/auth/oauth-login-button'),
)

vi.mock(import('../../../hooks/use-turnstile'), () => ({
  useTurnstile: ({ onSuccess }: { onSuccess: (token: string) => void }) => {
    turnstileCallbacks.onSuccess = onSuccess
    return { ref: () => {}, reset: turnstileCallbacks.reset, isError: false }
  },
}))

export {
  mockContinueOAuthLogin,
  mockLoginWithEmailAddress,
  mockSendEmailLoginToken,
  turnstileCallbacks,
}
