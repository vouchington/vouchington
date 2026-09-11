import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HostnameVouchDisavowVote } from '../hostname-vouch-disavow-vote'

type NavigationModule = typeof import('next/navigation')

const mocks = vi.hoisted(() => ({
  submitHostnameVote: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
  useElectionVote: vi.fn<VitestLooseMock>().mockReturnValue({
    currentVote: null,
    countUp: 24,
    countDown: 3,
    isLoading: false,
    handleVote: vi.fn<VitestLooseMock>(),
  }),
}))

vi.mock(import('@/lib/api/client/elections'), () => ({
  submitHostnameVote: mocks.submitHostnameVote,
}))

vi.mock(import('@/lib/votes/use-election-vote'), () => ({
  useElectionVote: mocks.useElectionVote,
}))

vi.mock<typeof import('next/navigation')>(import('next/navigation'), async importOriginal => ({
  ...(await importOriginal<NavigationModule>()),
  usePathname: () => '/domain/example.com',
}))

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        'aria-label': ariaLabel,
        'data-pw': dataPw,
        'data-direction': dataDirection,
      }: {
        children: ReactNode
        href: string
        'aria-label'?: string
        'data-pw'?: string
        'data-direction'?: string
      }) => (
        <a
          href={href}
          aria-label={ariaLabel}
          data-pw={dataPw}
          data-direction={dataDirection}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

const ELECTION_ID = 'election-uuid-1'

function defaultProps() {
  return {
    electionId: ELECTION_ID,
    countUp: 24,
    countDown: 3,
  }
}

describe('HostnameVouchDisavowVote', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders semantic vote controls in the hostname namespace', () => {
    const { container } = render(<HostnameVouchDisavowVote {...defaultProps()} />)
    expect(container.querySelector('[data-vote-root="hostname-vouch-disavow-vote"]')).not.toBeNull()
  })

  it('renders the semantic choice trigger', () => {
    const { container } = render(<HostnameVouchDisavowVote {...defaultProps()} />)
    expect(container.querySelector('[data-pw="semantic-vote-trigger"]')).not.toBeNull()
  })

  it('shows correct vote counts in the rendered output', () => {
    mocks.useElectionVote.mockReturnValue({
      currentVote: null,
      countUp: 24,
      countDown: 3,
      isLoading: false,
      handleVote: vi.fn<VitestLooseMock>(),
    })
    const { container } = render(<HostnameVouchDisavowVote {...defaultProps()} />)
    // SplitCountsVote (default display) renders counts as plain <span> without data-pw
    const text = container.textContent ?? ''
    expect(text).toContain('24')
    expect(text).toContain('3')
  })

  it('renders signed-out vote links when signedOut is true', () => {
    const { container } = render(
      <HostnameVouchDisavowVote
        {...defaultProps()}
        signedOut
      />,
    )
    expect(container.querySelector('[data-pw="hostname-vouch-disavow-vote"]')).not.toBeNull()
    const signedOutLinks = container.querySelectorAll(
      '[data-pw="hostname-vouch-disavow-vote-sign-in"]',
    )
    expect(signedOutLinks.length).toBe(1)
    expect(container.querySelector('[data-pw="hostname-vouch-disavow-vote-trigger"]')).toBeNull()
    expect(container.querySelector('[data-pw="semantic-vote-trigger"]')).toBeNull()
  })

  it('does not render signed-out vote links when signedOut is false', () => {
    const { container } = render(
      <HostnameVouchDisavowVote
        {...defaultProps()}
        signedOut={false}
      />,
    )
    const signedOutLinks = container.querySelectorAll(
      '[data-pw="hostname-vouch-disavow-vote-sign-in"]',
    )
    expect(signedOutLinks.length).toBe(0)
  })

  it('accepts a custom vote namespace', () => {
    const { container } = render(
      <HostnameVouchDisavowVote
        {...defaultProps()}
        data-pw='custom-vote-widget'
      />,
    )
    expect(container.querySelector('[data-vote-root="custom-vote-widget"]')).not.toBeNull()
    expect(container.querySelector('[data-vote-root="hostname-vouch-disavow-vote"]')).toBeNull()
  })
})
