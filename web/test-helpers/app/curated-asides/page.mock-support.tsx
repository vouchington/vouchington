import type { ReactNode } from 'react'

import { vi } from 'vitest'

import {
  adminCreateCuratedAside,
  adminDeleteCuratedAside,
  adminListCuratedAsides,
  adminReorderCuratedAsides,
} from '@/lib/api/client/admin-curated-asides'
import type { CuratedAsideItem, CuratedAsideType } from '@/types/api-responses/curated-aside-items'

const toastMock = vi.hoisted(() =>
  Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
  }),
)

export { toastMock }

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

export const mockList = vi.mocked(adminListCuratedAsides)
export const mockCreate = vi.mocked(adminCreateCuratedAside)
export const mockDelete = vi.mocked(adminDeleteCuratedAside)
export const mockReorder = vi.mocked(adminReorderCuratedAsides)

export function makeCuratedAsideItem(overrides?: Partial<CuratedAsideItem>): CuratedAsideItem {
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

export function resetCuratedAsideMocks(): void {
  vi.clearAllMocks()
  mockList.mockResolvedValue({ curated_aside_items: [makeCuratedAsideItem()] })
  mockDelete.mockResolvedValue(undefined)
  mockReorder.mockResolvedValue(undefined)
  mockCreate.mockResolvedValue({
    curated_aside_item: makeCuratedAsideItem({
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
}
