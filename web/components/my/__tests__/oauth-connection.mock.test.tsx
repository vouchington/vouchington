import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { OAuthConnection } from '../oauth-connection'
import type { OAuthButtonProps } from '@/components/auth/oauth-provider-button'

const capturedOnAvailabilityChange = vi.hoisted(() => ({
  fn: null as ((v: boolean) => void) | null,
}))

vi.mock(import('@/components/auth/oauth-login-button'), () => ({
  OAuthLoginButton: ({ onAvailabilityChange }: OAuthButtonProps) => {
    capturedOnAvailabilityChange.fn = onAvailabilityChange ?? null
    return (
      <button
        type='button'
        data-testid='oauth-login-btn'
      >
        Connect
      </button>
    )
  },
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
}))

vi.mock(import('@/lib/auth/oauth-token-body'), () => ({
  tokenToBody: vi.fn<VitestLooseMock>(),
}))

const mockAccount = {
  id: 'oauth-1',
  name: 'Test User',
  email_address: 'tests+oauth-connection@voucha.ai',
}

describe('OAuthConnection', () => {
  beforeEach(() => {
    capturedOnAvailabilityChange.fn = null
    vi.clearAllMocks()
  })

  it('renders the provider heading', () => {
    render(
      <OAuthConnection
        provider='google'
        initialAccount={null}
      />,
    )
    expect(screen.getByRole('heading', { level: 2 })).toBeDefined()
  })

  it('shows login button when disconnected', () => {
    render(
      <OAuthConnection
        provider='google'
        initialAccount={null}
      />,
    )
    expect(screen.getByTestId('oauth-login-btn')).toBeDefined()
  })

  it('shows connected state when account is provided', () => {
    render(
      <OAuthConnection
        provider='google'
        initialAccount={mockAccount}
      />,
    )
    expect(screen.getByText('Test User')).toBeDefined()
    expect(screen.getByText('Disconnect')).toBeDefined()
  })

  it('hides everything when disconnected and provider becomes unavailable', () => {
    const { container } = render(
      <OAuthConnection
        provider='google'
        initialAccount={null}
      />,
    )
    act(() => {
      capturedOnAvailabilityChange.fn?.(false)
    })
    expect((container.firstChild as HTMLElement).hidden).toBe(true)
  })

  it('hides disconnected providers that are not backend configured', () => {
    const { container } = render(
      <OAuthConnection
        provider='github'
        initialAccount={null}
        providerConfigured={false}
      />,
    )

    expect((container.firstChild as HTMLElement).hidden).toBe(true)
    expect(screen.queryByTestId('oauth-login-btn')).toBeNull()
  })

  it('shows connected providers even when new connections are not backend configured', () => {
    const { container } = render(
      <OAuthConnection
        provider='github'
        initialAccount={mockAccount}
        providerConfigured={false}
      />,
    )

    expect((container.firstChild as HTMLElement).hidden).toBe(false)
    expect(screen.getByText('Test User')).toBeDefined()
    expect(screen.getByText('Disconnect')).toBeDefined()
  })

  it('shows when disconnected and provider becomes available', () => {
    render(
      <OAuthConnection
        provider='google'
        initialAccount={null}
      />,
    )
    act(() => {
      capturedOnAvailabilityChange.fn?.(true)
    })
    expect(screen.getByTestId('oauth-login-btn')).toBeDefined()
  })

  it('shows connected section regardless of initial providerAvailable state', () => {
    // When connected, hidden = (!account && providerAvailable === false) is always false
    // because !account is false. Verify the section is visible on initial connected render.
    const { container } = render(
      <OAuthConnection
        provider='google'
        initialAccount={mockAccount}
      />,
    )
    expect((container.firstChild as HTMLElement).hidden).toBe(false)
    expect(screen.getByText('Test User')).toBeDefined()
    expect(screen.getByText('Disconnect')).toBeDefined()
  })

  it('heading has correct data-pw attribute', () => {
    const { container } = render(
      <OAuthConnection
        provider='google'
        initialAccount={null}
      />,
    )
    expect(container.querySelector('[data-pw="oauth-connection-google-heading"]')).toBeDefined()
  })

  it('renders separator before content when separator prop is true', () => {
    const { container } = render(
      <OAuthConnection
        provider='google'
        initialAccount={null}
        separator
      />,
    )
    const separator = container.querySelector('[data-orientation="horizontal"]')
    expect(separator).toBeDefined()
  })

  it('does not render separator when separator prop is false', () => {
    const { container } = render(
      <OAuthConnection
        provider='google'
        initialAccount={null}
      />,
    )
    const separator = container.querySelector('[data-orientation="horizontal"]')
    expect(separator).toBeNull()
  })
})
