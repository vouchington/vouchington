import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import { LoginForm } from '../login-form'
import type { OAuthProvider } from '@/types/user'
import {
  clearRuntimePublicConfigForTest,
  setRuntimePublicConfigForTest,
} from '@/test-helpers/runtime-public-config'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href }: { children: ReactNode; href: string }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)
vi.mock(import('next/navigation'), () => navMockModule)

const mockNav = createNavMock()

const mockGetConfiguredOAuthProviders = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock(import('@/lib/api/client'), () => ({
  getConfiguredOAuthProviders: mockGetConfiguredOAuthProviders,
  continueOAuthLogin: vi.fn<VitestLooseMock>(),
  loginWithEmailAddress: vi.fn<VitestLooseMock>(),
  sendEmailLoginToken: vi.fn<VitestLooseMock>(),
}))
vi.mock(
  import('@/hooks/use-facebook-sdk'),
  () =>
    ({
      useFacebookSDK: () => ({ isAvailable: false }),
    }) as unknown as typeof import('@/hooks/use-facebook-sdk'),
)
vi.mock(import('@/hooks/use-turnstile'), () => ({
  useTurnstile: () => ({ ref: () => {}, reset: vi.fn<VitestLooseMock>(), isError: false }),
}))
vi.mock(
  import('../mfa-step'),
  () =>
    ({
      default: () => <div data-testid='mfa-step' />,
    }) as unknown as typeof import('../mfa-step'),
)
vi.mock(import('../oauth-login-button'), () => ({
  OAuthLoginButton: ({
    provider,
    broker,
  }: {
    provider: OAuthProvider
    broker?: { purpose: string }
  }) => (
    <button
      type='button'
      data-broker-purpose={broker?.purpose}
    >
      {`Continue with ${provider}`}
    </button>
  ),
}))

describe('LinkedIn login broker visibility', () => {
  beforeEach(() => {
    mockNav.reset()
    mockGetConfiguredOAuthProviders.mockReset()
  })
  afterEach(() => {
    clearRuntimePublicConfigForTest()
  })

  it('uses the web broker without a browser-visible client ID when enabled', async () => {
    mockGetConfiguredOAuthProviders.mockResolvedValue({
      providers: ['linkedin'],
      broker_capabilities: {
        linkedin: {
          version: 1,
          modes: { web: true, native: false },
          purposes: ['authenticate', 'connect'],
        },
      },
    })

    render(<LoginForm />)
    expect(await screen.findByRole('button', { name: /continue with linkedin/i })).toHaveAttribute(
      'data-broker-purpose',
      'authenticate',
    )
  })

  it('keeps the legacy path when web broker mode is disabled', async () => {
    setRuntimePublicConfigForTest({ linkedinClientId: 'test-linkedin-client-id' })
    mockGetConfiguredOAuthProviders.mockResolvedValue({ providers: ['linkedin'] })

    render(<LoginForm />)
    expect(
      await screen.findByRole('button', { name: /continue with linkedin/i }),
    ).not.toHaveAttribute('data-broker-purpose')
  })
})
