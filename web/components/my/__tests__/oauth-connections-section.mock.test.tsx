import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OAuthConnectionsSection } from '../oauth-connections-section'
import type { OAuthAccountInfo, OAuthProvider } from '@/types/user'
import {
  clearRuntimePublicConfigForTest,
  setRuntimePublicConfigForTest,
} from '@/test-helpers/runtime-public-config'

const mockGetConfiguredOAuthProviders = vi.hoisted(() =>
  vi.fn<VitestLooseMock>().mockResolvedValue({ providers: [] }),
)

vi.mock(import('@/components/auth/oauth-login-button'), () => ({
  OAuthLoginButton: ({ provider }: { provider: OAuthProvider }) => (
    <button type='button'>{`Connect ${provider}`}</button>
  ),
}))

vi.mock(import('@/components/auth/oauth-provider-icons'), () => ({
  ProviderIcon: ({ provider }: { provider: string }) => <span>{provider}</span>,
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { success: vi.fn<VitestLooseMock>(), error: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/api/client'), () => ({
  connectOAuthAccount: vi.fn<VitestLooseMock>(),
  disconnectOAuthAccount: vi.fn<VitestLooseMock>(),
  getConfiguredOAuthProviders: mockGetConfiguredOAuthProviders,
}))

vi.mock(import('@/lib/auth/oauth-token-body'), () => ({
  tokenToBody: vi.fn<VitestLooseMock>(),
}))

const emptyAccounts: Record<OAuthProvider, OAuthAccountInfo | null> = {
  facebook: null,
  apple: null,
  google: null,
  x: null,
  linkedin: null,
  microsoft: null,
  github: null,
}

const mockAccount: OAuthAccountInfo = {
  id: 'github-account',
  name: 'GitHub User',
  email_address: 'tests+github@voucha.ai',
}

describe('OAuthConnectionsSection', () => {
  beforeEach(() => {
    mockGetConfiguredOAuthProviders.mockReset()
    mockGetConfiguredOAuthProviders.mockResolvedValue({ providers: [] })
  })

  afterEach(() => {
    clearRuntimePublicConfigForTest()
  })

  it('shows connect rows only when runtime public config and backend readiness both include the provider', async () => {
    setRuntimePublicConfigForTest({
      facebookAppId: 'test-facebook-app-id',
      githubClientId: 'test-github-client-id',
    })
    mockGetConfiguredOAuthProviders.mockResolvedValue({ providers: ['github'] })

    render(<OAuthConnectionsSection accounts={emptyAccounts} />)

    expect(await screen.findByRole('button', { name: 'Connect github' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Connect facebook' })).toBeNull()
  })

  it('keeps connected accounts visible when new connections for that provider are unavailable', () => {
    setRuntimePublicConfigForTest({ githubClientId: 'test-github-client-id' })
    mockGetConfiguredOAuthProviders.mockResolvedValue({ providers: [] })

    render(
      <OAuthConnectionsSection
        accounts={{
          ...emptyAccounts,
          github: mockAccount,
        }}
      />,
    )

    expect(screen.getByText('GitHub User')).toBeDefined()
    expect(screen.getByText('Disconnect')).toBeDefined()
  })
})
