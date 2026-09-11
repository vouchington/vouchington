import React, { act, type ReactNode } from 'react'
import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { EntityRelation, EntityRelationsResponse } from '@/lib/api/entity-relations'

const { mockFetchEntityRelations, mockCreateEntityRelation } = vi.hoisted(() => ({
  mockFetchEntityRelations: vi.fn<VitestLooseMock>(),
  mockCreateEntityRelation: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/entity-relations'), () => ({
  fetchEntityRelations: mockFetchEntityRelations,
  createEntityRelation: mockCreateEntityRelation,
}))

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({ isAuthenticated: true }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: vi.fn<() => void>() }),
    }) as unknown as typeof import('next/navigation'),
)

// Use useState+useEffect so the component re-renders when loaded, avoiding
// React.lazy's suspension which conflicts with use(relationsPromise) suspension
// in the parent Suspense boundary.
vi.mock(
  import('next/dynamic'),
  () =>
    ({
      default: (
        factory: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>,
      ) => {
        const promise = factory()
        return function DynamicComponent(props: Record<string, unknown>) {
          const [comp, setComp] = React.useState<React.ComponentType<
            Record<string, unknown>
          > | null>(null)
          React.useEffect(() => {
            void promise.then(m => {
              setComp(() => m.default)
            })
          }, [])
          if (!comp) return null
          const Comp = comp
          return <Comp {...props} />
        }
      },
    }) as unknown as typeof import('next/dynamic'),
)

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/components/ui/dropdown-menu'),
  () =>
    ({
      DropdownMenuItem: ({
        children,
        onSelect,
      }: {
        children: ReactNode
        onSelect?: (e: Event) => void
        'data-pw'?: string
      }) => (
        <button
          type='button'
          role='menuitem'
          onClick={() => onSelect?.(new Event('select'))}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/dropdown-menu'),
)

vi.mock(
  import('@/components/ui/dialog'),
  () =>
    ({
      Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
        open ? <div data-testid='dialog'>{children}</div> : null,
      DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
      DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    }) as unknown as typeof import('@/components/ui/dialog'),
)

vi.mock(import('@/components/tags/manage-tags-card'), () => ({
  ManageTagsCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock(import('@/components/tags/tag-autocomplete'), () => ({
  TagAutocomplete: ({ onSelect }: { onSelect: (id: string) => void }) => (
    <button
      type='button'
      data-testid='autocomplete-select'
      onClick={() => onSelect('topic-amazon')}
    >
      Select tag
    </button>
  ),
}))

vi.mock(
  import('@/components/tags/tag-list'),
  () =>
    ({
      TagList: ({
        relations,
        electionVotes: _ev,
        objectType: _ot,
        showVoting: _sv,
        isAuthenticated: _ia,
      }: {
        relations: EntityRelation[]
        electionVotes: Record<string, unknown>
        objectType: string
        showVoting: boolean
        isAuthenticated: boolean
      }) => (
        <div data-testid='tag-list'>
          {relations.map(r => (
            <div
              key={r.object_id}
              data-testid='tag-item'
            >
              {r.object_id}
            </div>
          ))}
        </div>
      ),
    }) as unknown as typeof import('@/components/tags/tag-list'),
)

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    Tag: () => <svg data-testid='tag-icon' />,
  }),
)

import { ManageCategoriesMenuItem } from '../manage-categories-menu-item'

const emptyResponse: EntityRelationsResponse = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  entity_relations: {},
  election_votes: {},
}

const populatedResponse: EntityRelationsResponse = {
  results: [{ __entity_type: 'entity_relation', id: 'rel-1' }],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  entity_relations: {
    'rel-1': {
      object_id: 'topic-amazon',
      object_data: {},
      created_at: '2024-01-01T00:00:00Z',
      created_by_id: 'user-1',
    },
  },
  election_votes: {},
}

describe('ManageCategoriesMenuItem — refetch after add', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateEntityRelation.mockResolvedValue({
      id: 'new-rel',
      created_at: '2024-01-01T00:00:00Z',
      created_by_id: 'user-1',
      object_data: {},
    })
    mockFetchEntityRelations
      .mockResolvedValueOnce(emptyResponse)
      .mockResolvedValueOnce(populatedResponse)
  })

  it('shows newly added tag immediately in the list without a page reload', async () => {
    render(<ManageCategoriesMenuItem entityId='item-1' />)

    // Open the dialog — triggers fetch #1; await act to flush use(relationsPromise) suspension
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem'))
    })

    // Wait for the add form to render (dynamic component loads asynchronously via useEffect)
    const selectBtn = await waitFor(() => screen.getByTestId('autocomplete-select'))
    expect(screen.getByTestId('tag-list')).toBeDefined()
    expect(screen.queryByTestId('tag-item')).toBeNull()

    // Add a tag; await act to flush createEntityRelation, startTransition, and re-suspension
    await act(async () => {
      fireEvent.click(selectBtn)
    })

    // The tag should appear immediately without a page reload (fetch #2 triggered by onTagAdded)
    await waitFor(() => {
      expect(screen.getByText('topic-amazon')).toBeDefined()
    })

    expect(mockCreateEntityRelation).toHaveBeenCalledWith(
      'rss_feed_item',
      'item-1',
      'category',
      'topic',
      'topic-amazon',
    )
    expect(mockFetchEntityRelations).toHaveBeenCalledTimes(2)
    expect(mockFetchEntityRelations).toHaveBeenCalledWith(
      'rss_feed_item',
      'item-1',
      'category',
      'topic',
      { sort: 'best' },
    )
  })
})
