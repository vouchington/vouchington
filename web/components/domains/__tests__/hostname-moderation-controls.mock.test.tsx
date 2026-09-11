import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HostnameModerationControls } from '../hostname-moderation-controls'

type SonnerModule = typeof import('sonner')

const mocks = vi.hoisted(() => ({
  refresh: vi.fn<VitestLooseMock>(),
  updateHostname: vi.fn<VitestLooseMock>().mockResolvedValue(null),
  toastSuccess: vi.fn<VitestLooseMock>(),
  toastError: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  async importOriginal =>
    ({
      ...(await importOriginal()),
      useRouter: () => ({
        back: vi.fn<VitestLooseMock>(),
        forward: vi.fn<VitestLooseMock>(),
        prefetch: vi.fn<VitestLooseMock>(),
        push: vi.fn<VitestLooseMock>(),
        refresh: mocks.refresh,
        replace: vi.fn<VitestLooseMock>(),
      }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('sonner'), async importOriginal => {
  const actual = await importOriginal<SonnerModule>()
  return {
    ...actual,
    toast: Object.assign(vi.fn<VitestLooseMock>(), actual.toast, {
      success: mocks.toastSuccess,
      error: mocks.toastError,
    }),
  }
})

vi.mock(import('@/lib/api/client/hostnames'), () => ({
  updateHostname: mocks.updateHostname,
  createHostname: vi.fn<VitestLooseMock>(),
  fetchHostnames: vi.fn<VitestLooseMock>(),
}))

const HOSTNAME_ID = 'hostname-uuid-1'

function defaultProps() {
  return {
    hostnameId: HOSTNAME_ID,
    blocked: false as boolean | null | undefined,
    crawlable: true as boolean | null | undefined,
    linkRelFollow: true as boolean | null | undefined,
  }
}

describe('HostnameModerationControls', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the moderation controls container', () => {
    render(<HostnameModerationControls {...defaultProps()} />)
    expect(document.querySelector('[data-pw="hostname-moderation-controls"]')).not.toBeNull()
  })

  it('renders three switches for blocked, crawlable, and link_rel_follow', () => {
    render(<HostnameModerationControls {...defaultProps()} />)
    expect(document.querySelector('[data-pw="hostname-blocked-switch"]')).not.toBeNull()
    expect(document.querySelector('[data-pw="hostname-crawlable-switch"]')).not.toBeNull()
    expect(document.querySelector('[data-pw="hostname-link-rel-follow-switch"]')).not.toBeNull()
  })

  it('crawlable switch reflects prop value', () => {
    render(
      <HostnameModerationControls
        {...defaultProps()}
        crawlable={false}
      />,
    )
    const crawlableSwitch = document.querySelector('[data-pw="hostname-crawlable-switch"]')
    expect(crawlableSwitch?.getAttribute('data-state')).toBe('unchecked')
  })

  it('toggles crawlable and calls updateHostname with correct args', async () => {
    render(<HostnameModerationControls {...defaultProps()} />)
    const crawlableSwitch = document.querySelector('[data-pw="hostname-crawlable-switch"]')!
    fireEvent.click(crawlableSwitch)
    await waitFor(() => {
      expect(mocks.updateHostname).toHaveBeenCalledWith(HOSTNAME_ID, { crawlable: false })
    })
  })

  it('toggles link_rel_follow and calls updateHostname with correct args', async () => {
    render(<HostnameModerationControls {...defaultProps()} />)
    const linkRelFollowSwitch = document.querySelector(
      '[data-pw="hostname-link-rel-follow-switch"]',
    )!
    fireEvent.click(linkRelFollowSwitch)
    await waitFor(() => {
      expect(mocks.updateHostname).toHaveBeenCalledWith(HOSTNAME_ID, { link_rel_follow: false })
    })
  })

  it('keeps crawlable and link_rel_follow switches editable when blocked is true', () => {
    render(
      <HostnameModerationControls
        {...defaultProps()}
        blocked
      />,
    )
    const crawlableSwitch = document.querySelector('[data-pw="hostname-crawlable-switch"]')
    const linkRelFollowSwitch = document.querySelector(
      '[data-pw="hostname-link-rel-follow-switch"]',
    )
    expect(crawlableSwitch).toHaveProperty('disabled', false)
    expect(linkRelFollowSwitch).toHaveProperty('disabled', false)
  })

  it('calls router.refresh after successful updateHostname', async () => {
    render(<HostnameModerationControls {...defaultProps()} />)
    const crawlableSwitch = document.querySelector('[data-pw="hostname-crawlable-switch"]')!
    fireEvent.click(crawlableSwitch)
    await waitFor(() => {
      expect(mocks.refresh).toHaveBeenCalled()
    })
  })

  it('shows toast success after successful toggle', async () => {
    render(<HostnameModerationControls {...defaultProps()} />)
    const crawlableSwitch = document.querySelector('[data-pw="hostname-crawlable-switch"]')!
    fireEvent.click(crawlableSwitch)
    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Hostname updated')
    })
  })

  it('shows toast error and does not call refresh when updateHostname throws', async () => {
    mocks.updateHostname.mockRejectedValueOnce(new Error('Network error'))
    render(<HostnameModerationControls {...defaultProps()} />)
    const crawlableSwitch = document.querySelector('[data-pw="hostname-crawlable-switch"]')!
    fireEvent.click(crawlableSwitch)
    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('Failed to update hostname')
    })
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('opens block confirmation dialog when blocked switch is clicked', async () => {
    render(<HostnameModerationControls {...defaultProps()} />)
    const blockedSwitch = document.querySelector('[data-pw="hostname-blocked-switch"]')!
    fireEvent.click(blockedSwitch)
    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeDefined()
    })
  })

  it('calls updateHostname with { blocked: true } after block confirmation', async () => {
    render(<HostnameModerationControls {...defaultProps()} />)
    const blockedSwitch = document.querySelector('[data-pw="hostname-blocked-switch"]')!
    fireEvent.click(blockedSwitch)
    await waitFor(() => screen.getByRole('alertdialog'))
    fireEvent.click(screen.getByRole('button', { name: 'Block hostname' }))
    await waitFor(() => {
      expect(mocks.updateHostname).toHaveBeenCalledWith(HOSTNAME_ID, { blocked: true })
    })
  })

  it('opens unblock confirmation dialog when blocked switch is clicked while blocked', async () => {
    render(
      <HostnameModerationControls
        {...defaultProps()}
        blocked
      />,
    )
    const blockedSwitch = document.querySelector('[data-pw="hostname-blocked-switch"]')!
    fireEvent.click(blockedSwitch)
    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeDefined()
    })
  })

  it('calls updateHostname with { blocked: false } after unblock confirmation', async () => {
    render(
      <HostnameModerationControls
        {...defaultProps()}
        blocked
      />,
    )
    const blockedSwitch = document.querySelector('[data-pw="hostname-blocked-switch"]')!
    fireEvent.click(blockedSwitch)
    await waitFor(() => screen.getByRole('alertdialog'))
    fireEvent.click(screen.getByRole('button', { name: 'Unblock' }))
    await waitFor(() => {
      expect(mocks.updateHostname).toHaveBeenCalledWith(HOSTNAME_ID, { blocked: false })
    })
  })
})
