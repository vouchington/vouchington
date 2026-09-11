import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
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
  import('@/lib/links/entity-href'),
  () =>
    ({
      domainHref: (hostname: { hostname: string }) => `/domains/${hostname.hostname}`,
    }) as unknown as typeof import('@/lib/links/entity-href'),
)

vi.mock(import('@/components/domains/domain-trust-badge'), () => ({
  DomainTrustBadge: () => <div data-testid='domain-trust-badge' />,
}))

vi.mock(import('@/components/hostnames/hostname-vouch-disavow-vote'), () => ({
  HostnameVouchDisavowVote: () => <div data-testid='hostname-vouch-disavow-vote' />,
}))

vi.mock(import('@/components/topics/topic-label'), () => ({
  TopicLabel: () => <div data-testid='topic-label' />,
}))

import { HostnameListItem } from '../hostname-list-item'
import type { Hostname } from '@/types/hostnames'

function makeHostname(overrides?: Partial<Hostname>): Hostname {
  return {
    __entity_type: 'hostname',
    id: 'hostname-1',
    hostname: 'example.com',
    topic_id: null,
    ...overrides,
  }
}

describe('HostnameListItem — blocked badge visibility', () => {
  it('does not render blocked badge when isAdmin is false', () => {
    render(
      <HostnameListItem
        hostname={makeHostname({ blocked: true })}
        isAdmin={false}
      />,
    )
    expect(screen.queryByText('Blocked')).toBeNull()
  })

  it('does not render blocked badge when isAdmin is true but hostname.blocked is false', () => {
    render(
      <HostnameListItem
        hostname={makeHostname({ blocked: false })}
        isAdmin
      />,
    )
    expect(screen.queryByText('Blocked')).toBeNull()
  })

  it('renders blocked badge when isAdmin is true and hostname.blocked is true', () => {
    render(
      <HostnameListItem
        hostname={makeHostname({ blocked: true })}
        isAdmin
      />,
    )
    expect(screen.getByText('Blocked')).toBeDefined()
  })
})
