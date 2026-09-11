import type { ReactNode } from 'react'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import CuratedAsidesPage from '../curated-asides-client'

import CuratedAsidesRedirectPage, {
  dynamic as redirectDynamic,
  metadata as redirectMetadata,
} from '../page'
import CuratedAsideCommunitiesRoutePage, {
  dynamic as communitiesDynamic,
  metadata as communitiesMetadata,
} from '../communities/page'
import CuratedAsideSourcesRoutePage, {
  dynamic as sourcesDynamic,
  metadata as sourcesMetadata,
} from '../sources/page'
import { dynamic as topicsDynamic, metadata as topicsMetadata } from '../topics/page'

import {
  adminCreateCuratedAside,
  adminListCuratedAsides,
  adminReorderCuratedAsides,
} from '@/lib/api/client/admin-curated-asides'

import type { CuratedAsideItem, CuratedAsideType } from '@/types/api-responses/curated-aside-items'

const { redirectMock, routerPushMock, toastMock } = vi.hoisted(() => {
  const redirect = vi.fn<VitestLooseMock>()
  const routerPush = vi.fn<VitestLooseMock>()
  const toast = Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
  })
  return { redirectMock: redirect, routerPushMock: routerPush, toastMock: toast }
})

vi.mock(
  import('next/navigation'),
  () =>
    ({
      redirect: redirectMock,
      useRouter: () => ({ push: routerPushMock }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client/admin-curated-asides'), () => ({
  adminListCuratedAsides: vi.fn<VitestLooseMock>(),
  adminCreateCuratedAside: vi.fn<VitestLooseMock>(),
  adminDeleteCuratedAside: vi.fn<VitestLooseMock>(),
  adminReorderCuratedAsides: vi.fn<VitestLooseMock>(),
}))

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

function makeSecondItem(): CuratedAsideItem {
  return makeItem({
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
  })
}

describe('CuratedAsidesPage route and edge coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue({ curated_aside_items: [makeItem()] })
    mockCreate.mockResolvedValue({ curated_aside_item: makeItem({ id: 'item-new' }) })
    mockReorder.mockResolvedValue(undefined)
  })

  it('renders URL route wrappers for each curated aside tab', async () => {
    expect(topicsDynamic).toBe('force-dynamic')
    expect(sourcesDynamic).toBe('force-dynamic')
    expect(communitiesDynamic).toBe('force-dynamic')
    expect(topicsMetadata.title).toBe('Curated Aside Topics | Admin')
    expect(sourcesMetadata.title).toBe('Curated Aside Sources | Admin')
    expect(communitiesMetadata.title).toBe('Curated Aside Communities | Admin')

    const { unmount } = render(<CuratedAsideSourcesRoutePage />)
    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith('source')
    })
    unmount()

    render(<CuratedAsideCommunitiesRoutePage />)

    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith('community')
    })
  })

  it('redirects the legacy curated asides URL to the topics URL tab', () => {
    expect(redirectDynamic).toBe('force-dynamic')
    expect(redirectMetadata.title).toBe('Curated Asides | Admin')

    CuratedAsidesRedirectPage()

    expect(redirectMock).toHaveBeenCalledWith('/curated-asides/topics')
  })

  it('shows error toast when initial loading fails', async () => {
    mockList.mockRejectedValueOnce(new Error('Load failed'))
    render(<CuratedAsidesPage activeAsideType='topic' />)

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to load topic curated asides')
    })
  })

  it('submits the inline add form and shows add errors', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Create failed'))
    const { container } = render(<CuratedAsidesPage activeAsideType='topic' />)
    await screen.findByText('Premium Travel Cards')

    fireEvent.submit(container.querySelector('form')!)
    fireEvent.click(screen.getByRole('button', { name: 'Select topic' }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to add curated item')
    })
  })

  it('reorders items when move down is clicked and ignores invalid drag drops', async () => {
    mockList.mockResolvedValue({
      curated_aside_items: [makeItem({ position: 0 }), makeSecondItem()],
    })
    const dataTransfer = {
      effectAllowed: '',
      getData: vi.fn<(type: string) => string>(() => ''),
      setData: vi.fn<(type: string, value: string) => void>(),
    }

    render(<CuratedAsidesPage activeAsideType='topic' />)
    await screen.findByText('Premium Travel Cards')

    const firstRow = screen.getAllByRole('row')[1]!
    const preventDefault = vi.fn<() => void>()
    fireEvent.dragOver(firstRow, { preventDefault })
    fireEvent.drop(firstRow, { dataTransfer })

    expect(mockReorder).not.toHaveBeenCalled()

    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]!)

    await waitFor(() => {
      expect(mockReorder).toHaveBeenCalledWith('topic', ['item-2', 'item-1'])
    })
  })

  it('pushes the selected tab URL when the tab value changes', async () => {
    render(<CuratedAsidesPage activeAsideType='topic' />)
    await screen.findByText('Premium Travel Cards')

    fireEvent.click(screen.getByRole('tab', { name: 'Communities' }))

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith('/curated-asides/communities')
    })
  })
})
