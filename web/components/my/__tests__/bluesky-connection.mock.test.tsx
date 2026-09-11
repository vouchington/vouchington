/* oxlint-disable vitest/prefer-import-in-mock, jest/no-untyped-mock-factory -- web tests use string-literal vi.mock() calls so runtime dynamic imports stay mocked at lazy boundaries. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { BlueskyConnection } from '../bluesky-connection'

type SonnerModule = typeof import('sonner')

const mocks = vi.hoisted(() => ({
  fediverseEnabled: true,
  beginBlueskyAccountLink: vi.fn<VitestLooseMock>(),
  disconnectBlueskyAccount: vi.fn<VitestLooseMock>(),
  toastSuccess: vi.fn<VitestLooseMock>(),
  toastError: vi.fn<VitestLooseMock>(),
  locationAssign: vi.fn<VitestLooseMock>(),
}))

vi.mock('next/navigation', () => navMockModule)

const mockNav = createNavMock()

vi.mock('sonner', async importOriginal => {
  const actual = await importOriginal<SonnerModule>()
  return {
    ...actual,
    toast: Object.assign(vi.fn<VitestLooseMock>(), actual.toast, {
      success: mocks.toastSuccess,
      error: mocks.toastError,
    }),
  }
})

vi.mock('@/lib/api/client', () => ({
  beginBlueskyAccountLink: mocks.beginBlueskyAccountLink,
  disconnectBlueskyAccount: mocks.disconnectBlueskyAccount,
}))

vi.mock('@/lib/feature-flags/use-feature-flags', () => ({
  useFeatureFlags: () => ({ fediverse: mocks.fediverseEnabled }),
}))

const mockAccount = { did: 'did:plc:abc123xyz', handle: 'alice.bsky.social' }

function typeHandle(value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Bluesky handle' }), {
    target: { value },
  })
}

describe('BlueskyConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
    mocks.fediverseEnabled = true
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign: mocks.locationAssign, pathname: '/my/identity' },
      writable: true,
    })
  })

  it('renders nothing when the fediverse flag is off', () => {
    mocks.fediverseEnabled = false
    const { container } = render(<BlueskyConnection initialAccount={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the heading when the flag is on', () => {
    render(<BlueskyConnection initialAccount={null} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Bluesky' })).toBeDefined()
    expect(document.querySelector('[data-pw="bluesky-connection-heading"]')).not.toBeNull()
  })

  it('shows a handle input and disabled connect button when disconnected', () => {
    render(<BlueskyConnection initialAccount={null} />)
    expect(document.querySelector('[data-pw="bluesky-connection-handle-input"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Connect' })).toHaveProperty('disabled', true)
  })

  it('enables the connect button once a handle is typed', () => {
    render(<BlueskyConnection initialAccount={null} />)
    typeHandle('alice.bsky.social')
    expect(screen.getByRole('button', { name: 'Connect' })).toHaveProperty('disabled', false)
  })

  it('redirects to the returned https authorization URL on submit', async () => {
    mocks.beginBlueskyAccountLink.mockResolvedValue({
      redirect_url: 'https://bsky.social/oauth/authorize?request_uri=abc',
    })
    render(<BlueskyConnection initialAccount={null} />)
    typeHandle('alice.bsky.social')
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    await waitFor(() => {
      expect(mocks.locationAssign).toHaveBeenCalledWith(
        'https://bsky.social/oauth/authorize?request_uri=abc',
      )
    })
    expect(mocks.beginBlueskyAccountLink).toHaveBeenCalledWith('alice.bsky.social')
  })

  it('blocks redirect and shows an error toast for a non-https redirect URL', async () => {
    mocks.beginBlueskyAccountLink.mockResolvedValue({ redirect_url: 'http://bsky.social/oauth' })
    render(<BlueskyConnection initialAccount={null} />)
    typeHandle('alice.bsky.social')
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        'Bluesky sign-in redirect URL is not secure. Please try again.',
      )
    })
    expect(mocks.locationAssign).not.toHaveBeenCalled()
  })

  it('shows an error toast when link-begin fails', async () => {
    mocks.beginBlueskyAccountLink.mockRejectedValue(new Error('boom'))
    render(<BlueskyConnection initialAccount={null} />)
    typeHandle('alice.bsky.social')
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('Failed to start Bluesky sign-in')
    })
  })

  it('shows the handle and disconnect button when connected', () => {
    render(<BlueskyConnection initialAccount={mockAccount} />)
    expect(screen.getByText('alice.bsky.social')).toBeDefined()
    expect(
      document.querySelector('[data-pw="bluesky-connection-disconnect-button"]'),
    ).not.toBeNull()
    expect(document.querySelector('[data-pw="bluesky-connection-handle-input"]')).toBeNull()
  })

  it('falls back to the DID when the handle has not resolved', () => {
    render(<BlueskyConnection initialAccount={{ did: 'did:plc:abc123xyz', handle: null }} />)
    expect(screen.getByText('did:plc:abc123xyz')).toBeDefined()
  })

  it('disconnects and clears the account on click', async () => {
    mocks.disconnectBlueskyAccount.mockResolvedValue(undefined)
    render(<BlueskyConnection initialAccount={mockAccount} />)
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))

    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Bluesky account disconnected')
    })
    expect(document.querySelector('[data-pw="bluesky-connection-handle-input"]')).not.toBeNull()
  })

  it('shows an error toast when disconnect fails', async () => {
    mocks.disconnectBlueskyAccount.mockRejectedValue(new Error('boom'))
    render(<BlueskyConnection initialAccount={mockAccount} />)
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('Failed to disconnect Bluesky account')
    })
    expect(
      document.querySelector('[data-pw="bluesky-connection-disconnect-button"]'),
    ).not.toBeNull()
  })

  it('flashes a success toast and strips the query param after a successful callback redirect', async () => {
    mockNav.setSearchParams('bluesky=linked')
    render(<BlueskyConnection initialAccount={mockAccount} />)

    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Bluesky account connected')
    })
    expect(mockNav.replace).toHaveBeenCalledWith('/my/identity', { scroll: false })
  })

  it('flashes a mapped error toast for a known bluesky_error code', async () => {
    mockNav.setSearchParams('bluesky_error=already_linked')
    render(<BlueskyConnection initialAccount={null} />)

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        'That Bluesky account is already linked to a different Voucha account.',
      )
    })
  })

  it('explains that a suspended account was not connected', async () => {
    mockNav.setSearchParams('bluesky_error=account_suspended')
    render(<BlueskyConnection initialAccount={null} />)

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        'Your Voucha account is suspended. Your Bluesky account was not connected.',
      )
    })
  })

  it('falls back to the unknown error message for an unrecognized bluesky_error code', async () => {
    mockNav.setSearchParams('bluesky_error=weird_code')
    render(<BlueskyConnection initialAccount={null} />)

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        'Failed to link your Bluesky account. Please try again.',
      )
    })
  })

  it('does not flash a toast when the flag is off, even with a callback query param', () => {
    mocks.fediverseEnabled = false
    mockNav.setSearchParams('bluesky=linked')
    render(<BlueskyConnection initialAccount={null} />)
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })
})
