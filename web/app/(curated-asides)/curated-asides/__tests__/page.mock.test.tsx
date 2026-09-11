import type { ReactNode } from 'react'

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import CuratedAsidesPage from '../curated-asides-client'

import CuratedAsideTopicsRoutePage from '../topics/page'

import {
  adminCreateCuratedAside,
  adminDeleteCuratedAside,
  adminListCuratedAsides,
  adminReorderCuratedAsides,
} from '@/lib/api/client/admin-curated-asides'

import type { CuratedAsideItem, CuratedAsideType } from '@/types/api-responses/curated-aside-items'

const { toastMock } = vi.hoisted(() => {
  const toast = Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
  })
  return { toastMock: toast }
})

vi.mock(import('@/lib/api/client/admin-curated-asides'), () => ({
  adminListCuratedAsides: vi.fn<VitestLooseMock>(),
  adminCreateCuratedAside: vi.fn<VitestLooseMock>(),
  adminDeleteCuratedAside: vi.fn<VitestLooseMock>(),
  adminReorderCuratedAsides: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: vi.fn<VitestLooseMock>() }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: toastMock,
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/on-error'), () => ({
  default: (_err: unknown, options: { fallback: string }) => {
    toastMock.error(options.fallback)
    return options.fallback
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

vi.mock(import('@/components/admin/admin-page-header'), () => ({
  AdminPageHeader: ({ title }: { title: string; description?: string; children?: ReactNode }) => (
    <h1>{title}</h1>
  ),
}))

vi.mock(
  import('@/components/admin/curated-asides/curated-aside-entity-autocomplete'),
  () =>
    ({
      CuratedAsideEntityAutocomplete: ({
        asideType,
        disabled,
        onSelect,
      }: {
        asideType: CuratedAsideType
        disabled?: boolean
        onSelect: (item: { id: string; label: string }) => void
      }) => (
        <button
          type='button'
          disabled={disabled}
          onClick={() =>
            onSelect({
              id: `${asideType}-selected`,
              label: `Selected ${asideType}`,
            })
          }
        >
          Select {asideType}
        </button>
      ),
    }) as unknown as typeof import('@/components/admin/curated-asides/curated-aside-entity-autocomplete'),
)

vi.mock(import('@/components/ui/tabs'), () => {
  let selectedValue = ''
  let selectValue: (value: string) => void = () => undefined

  return {
    Tabs: ({
      children,
      onValueChange,
      value,
    }: {
      children?: ReactNode
      onValueChange: (value: string) => void
      value: string
    }) => {
      selectedValue = value
      selectValue = onValueChange
      return <div>{children}</div>
    },
    TabsContent: ({ children, value }: { children?: ReactNode; value: string }) => {
      return selectedValue === value ? <div role='tabpanel'>{children}</div> : null
    },
    TabsList: ({ children }: { children?: ReactNode }) => <div role='tablist'>{children}</div>,
    TabsTrigger: ({
      children,
      value,
    }: {
      children?: ReactNode
      value: string
      asChild?: boolean
    }) => (
      <button
        aria-selected={selectedValue === value}
        onClick={() => selectValue(value)}
        role='tab'
        type='button'
      >
        {children}
      </button>
    ),
  } as unknown as typeof import('@/components/ui/tabs')
})

const mockList = vi.mocked(adminListCuratedAsides)
const mockCreate = vi.mocked(adminCreateCuratedAside)
const mockDelete = vi.mocked(adminDeleteCuratedAside)
const mockReorder = vi.mocked(adminReorderCuratedAsides)

function makeItem(overrides?: Partial<CuratedAsideItem>): CuratedAsideItem {
  const asideType = overrides?.aside_type ?? 'topic'
  const entityId = overrides?.entity_id ?? `${asideType}-entity`
  return {
    id: 'item-1',
    aside_type: asideType,
    entity_id: entityId,
    position: 0,
    created_by_id: 'user-1',
    created_at: '2024-01-01T00:00:00Z',
    entity_data:
      asideType === 'source'
        ? {
            entity_type: 'source',
            id: entityId,
            title: 'Premium Points Feed',
            rss_feed_url: 'https://example.test/feed.xml',
            home_page_url: 'https://example.test',
            topic_name: 'Premium Points',
          }
        : asideType === 'community'
          ? {
              entity_type: 'community',
              id: entityId,
              name: 'Rewards Community',
              slug: 'rewards-community',
            }
          : {
              entity_type: 'topic',
              id: entityId,
              name: 'Premium Travel Cards',
              slug: 'premium-travel-cards',
              topic_type: 'topic',
            },
    ...overrides,
  }
}

describe('CuratedAsidesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue({ curated_aside_items: [makeItem()] })
    mockDelete.mockResolvedValue(undefined)
    mockReorder.mockResolvedValue(undefined)
    mockCreate.mockResolvedValue({
      curated_aside_item: makeItem({
        id: 'item-new',
        entity_id: 'topic-selected',
        entity_data: {
          entity_type: 'topic',
          id: 'topic-selected',
          name: 'Selected topic',
          slug: 'selected-topic',
          topic_type: 'topic',
        },
      }),
    })
  })

  it('renders through the topics route page wrapper', async () => {
    render(<CuratedAsideTopicsRoutePage />)
    expect(screen.getByText('Curated Asides')).toBeInTheDocument()
    expect(await screen.findByText('Premium Travel Cards')).toBeInTheDocument()
  })

  it('shows loading state initially and disables inline add controls', () => {
    mockList.mockReturnValue(new Promise(() => undefined))
    render(<CuratedAsidesPage activeAsideType='topic' />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select topic' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Add Item' })).not.toBeInTheDocument()
  })

  it('renders entity labels without position or UUID columns', async () => {
    render(<CuratedAsidesPage activeAsideType='topic' />)
    expect(await screen.findByText('Premium Travel Cards')).toBeInTheDocument()
    expect(screen.getByText('premium-travel-cards')).toBeInTheDocument()
    expect(screen.queryByText('Position')).not.toBeInTheDocument()
    expect(screen.queryByText('Entity UUID')).not.toBeInTheDocument()
    expect(screen.queryByText('topic-entity')).not.toBeInTheDocument()
  })

  it('deletes an item and removes it from the list', async () => {
    render(<CuratedAsidesPage activeAsideType='topic' />)
    await screen.findByText('Premium Travel Cards')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('item-1')
    })
    expect(screen.queryByText('Premium Travel Cards')).not.toBeInTheDocument()
  })

  it('shows error toast when delete fails', async () => {
    mockDelete.mockRejectedValueOnce(new Error('Delete failed'))
    render(<CuratedAsidesPage activeAsideType='topic' />)
    await screen.findByText('Premium Travel Cards')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to delete curated item')
    })
  })

  it('reorders items when move up is clicked', async () => {
    const items = [
      makeItem({ id: 'item-1', position: 0 }),
      makeItem({
        id: 'item-2',
        entity_id: 'topic-entity-2',
        position: 1,
        entity_data: {
          entity_type: 'topic',
          id: 'topic-entity-2',
          name: 'Transfer Bonuses',
          slug: 'transfer-bonuses',
          topic_type: 'topic',
        },
      }),
    ]
    mockList.mockResolvedValue({ curated_aside_items: items })

    render(<CuratedAsidesPage activeAsideType='topic' />)
    await screen.findByText('Premium Travel Cards')

    fireEvent.click(screen.getAllByRole('button', { name: 'Move up' })[1]!)

    await waitFor(() => {
      expect(mockReorder).toHaveBeenCalledWith('topic', ['item-2', 'item-1'])
    })

    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]!).getByText('Transfer Bonuses')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('Premium Travel Cards')).toBeInTheDocument()
  })
})
