import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock(import('@/components/domains/hostname-list-item'), () => ({
  HostnameListItem: ({ hostname }: { hostname: { hostname: string } }) => (
    <div data-testid={`hostname-list-item-${hostname.hostname}`}>{hostname.hostname}</div>
  ),
}))

vi.mock(
  import('@/components/shared/empty-state'),
  () =>
    ({
      EmptyState: ({ title }: { title: string }) => <div data-testid='empty-state'>{title}</div>,
    }) as unknown as typeof import('@/components/shared/empty-state'),
)

vi.mock(import('../relation-management-action'), () => ({
  RelationManagementAction: ({ entityId }: { entityId: string }) => (
    <button
      type='button'
      data-testid={`relation-action-${entityId}`}
    >
      Action
    </button>
  ),
}))

import { UserHostnameRelationList } from '../user-hostname-relation-list'
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

describe('UserHostnameRelationList', () => {
  it('renders empty state when hostnames array is empty', () => {
    render(
      <UserHostnameRelationList
        hostnames={[]}
        emptyTitle='No hostnames'
        emptyDescription='Nothing to show.'
      />,
    )
    expect(screen.getByTestId('empty-state')).toBeDefined()
    expect(screen.getByText('No hostnames')).toBeDefined()
  })

  it('renders a HostnameListItem for each hostname', () => {
    const hostnames: Hostname[] = [
      makeHostname({ id: 'h-1', hostname: 'alpha.com' }),
      makeHostname({ id: 'h-2', hostname: 'beta.com' }),
    ]
    render(
      <UserHostnameRelationList
        hostnames={hostnames}
        emptyTitle='No hostnames'
        emptyDescription='Nothing to show.'
      />,
    )
    expect(screen.getByTestId('hostname-list-item-alpha.com')).toBeDefined()
    expect(screen.getByTestId('hostname-list-item-beta.com')).toBeDefined()
    expect(screen.queryByTestId('empty-state')).toBeNull()
  })
})
