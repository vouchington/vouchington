import type { ReactNode } from 'react'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import CuratedAsidesPage from '../curated-asides-client'

import {
  adminCreateCuratedAside,
  adminDeleteCuratedAside,
  adminListCuratedAsides,
  adminReorderCuratedAsides,
} from '@/lib/api/client/admin-curated-asides'

import type { CuratedAsideItem, CuratedAsideType } from '@/types/api-responses/curated-aside-items'

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
      toast: Object.assign(vi.fn<VitestLooseMock>(), {
        error: vi.fn<VitestLooseMock>(),
        success: vi.fn<VitestLooseMock>(),
      }),
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/on-error'), () => ({
  default: (_err: unknown, options: { fallback: string }) => options.fallback,
  onSuccess: (message: string) => message,
}))

vi.mock(import('@/components/admin/admin-page-header'), () => ({
  AdminPageHeader: ({ title }: { title: string; description?: string; children?: ReactNode }) => (
    <h1>{title}</h1>
  ),
}))

vi.mock(import('@/components/admin/curated-asides/curated-aside-entity-autocomplete'), () => ({
  CuratedAsideEntityAutocomplete: () => <button type='button'>Select topic</button>,
}))

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
    entity_data: {
      entity_type: 'topic',
      id: entityId,
      name: 'Premium Travel Cards',
      slug: 'premium-travel-cards',
      topic_type: 'topic',
    },
    ...overrides,
  }
}

describe('CuratedAsidesPage tab and drag behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue({ curated_aside_items: [makeItem()] })
    mockDelete.mockResolvedValue(undefined)
    mockReorder.mockResolvedValue(undefined)
    mockCreate.mockResolvedValue({ curated_aside_item: makeItem({ id: 'item-new' }) })
  })

  it('loads the active URL tab on mount', async () => {
    render(<CuratedAsidesPage activeAsideType='community' />)

    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith('community')
    })
  })

  it('loads a tab once when the active URL tab changes', async () => {
    mockList.mockImplementation(async (asideType: string) => ({
      curated_aside_items: [
        makeItem({
          id: `item-${asideType}`,
          aside_type: asideType as CuratedAsideType,
        }),
      ],
    }))

    const { rerender } = render(<CuratedAsidesPage activeAsideType='topic' />)
    await screen.findByText('Premium Travel Cards')
    mockList.mockClear()

    rerender(<CuratedAsidesPage activeAsideType='source' />)

    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith('source')
    })
    expect(mockList).toHaveBeenCalledTimes(1)
  })

  it('reorders items with drag and drop', async () => {
    mockList.mockResolvedValue({
      curated_aside_items: [
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
      ],
    })
    const dataTransfer = {
      effectAllowed: '',
      data: new Map<string, string>(),
      setData(type: string, value: string) {
        this.data.set(type, value)
      },
      getData(type: string) {
        return this.data.get(type) ?? ''
      },
    }

    render(<CuratedAsidesPage activeAsideType='topic' />)
    await screen.findByText('Premium Travel Cards')

    const handles = screen.getAllByRole('button', { name: 'Drag to reorder' })
    const rows = screen.getAllByRole('row').slice(1)
    fireEvent.dragStart(handles[0]!, { dataTransfer })
    fireEvent.drop(rows[1]!, { dataTransfer })

    await waitFor(() => {
      expect(mockReorder).toHaveBeenCalledWith('topic', ['item-2', 'item-1'])
    })
  })
})
