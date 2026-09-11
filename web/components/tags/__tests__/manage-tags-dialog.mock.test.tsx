import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'

const { mockFetchEntityRelations, mockManageTagsContent } = vi.hoisted(() => ({
  mockFetchEntityRelations: vi.fn<VitestLooseMock>(),
  mockManageTagsContent: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/entity-relations'), () => ({
  fetchEntityRelations: mockFetchEntityRelations,
}))
vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({ isAuthenticated: true }),
    }) as unknown as typeof import('@/lib/auth/context'),
)

vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({
        asChild,
        children,
        ...props
      }: {
        asChild?: boolean
        children: ReactNode
        [k: string]: unknown
      }) =>
        asChild ? (
          <div data-testid='button-as-child'>{children}</div>
        ) : (
          <button
            type='button'
            {...props}
          >
            {children}
          </button>
        ),
    }) as unknown as typeof import('@/components/ui/button'),
)

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
      DialogDescription: ({ children, className }: { children: ReactNode; className?: string }) => (
        <p className={className}>{children}</p>
      ),
      DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    }) as unknown as typeof import('@/components/ui/dialog'),
)

vi.mock(import('@/components/tags/manage-tags-card'), () => ({
  ManageTagsCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock(
  import('@/components/tags/manage-tags-content'),
  () =>
    ({
      ManageTagsContent: (props: Record<string, unknown>) => {
        mockManageTagsContent(props)
        return (
          <div data-testid='manage-tags-content'>
            {Array.isArray(props.enumOptions)
              ? String((props.enumOptions[0] as { slug?: string })?.slug)
              : 'none'}
          </div>
        )
      },
    }) as unknown as typeof import('@/components/tags/manage-tags-content'),
)

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href }: { children: ReactNode; href: string }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)

import { ManageTagsDialog } from '../manage-tags-dialog'

describe('ManageTagsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
    mockFetchEntityRelations.mockResolvedValue({
      entity_relations: [],
      election_votes: [],
      results: [],
    })
  })

  it('opens from a menu item trigger and fetches relations', async () => {
    render(
      <ManageTagsDialog
        entityType='rss_feed_item'
        entityId='item-1'
        predicate='category'
        objectType='topic'
        label='Category'
        heading='Category'
        dialogTitle='Manage categories'
        triggerLabel='Manage categories'
        trigger={openDialog => (
          <button
            type='button'
            role='menuitem'
            onClick={openDialog}
          >
            Manage categories
          </button>
        )}
        loadingText='Loading...'
        errorText='Error loading tags'
      />,
    )

    fireEvent.click(screen.getByRole('menuitem'))

    await waitFor(() => expect(screen.getByTestId('dialog')).toBeDefined())
    expect(screen.getByText('Category')).toHaveClass('sr-only')
    expect(mockFetchEntityRelations).toHaveBeenCalledWith(
      'rss_feed_item',
      'item-1',
      'category',
      'topic',
      { sort: 'best' },
    )
    expect(screen.getByTestId('manage-tags-content')).toBeDefined()
    expect(screen.queryByRole('link', { name: 'Manage all tags' })).toBeNull()
  })

  it('shows the full tags link when manageHref is provided and forwards enumOptions', async () => {
    render(
      <ManageTagsDialog
        entityType='topic'
        entityId='topic-1'
        predicate='publisher_type'
        objectType='topic'
        label='Publisher Type'
        heading='Publisher Type'
        dialogTitle='Manage publisher type'
        triggerLabel='Manage'
        manageHref='/source/test-topic/tags/publisher_type'
        enumOptions={[{ id: 'pt-1', slug: 'blog', label: 'Blog' }]}
        loadingText='Loading...'
        errorText='Error loading tags'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Manage' }))

    await waitFor(() => expect(screen.getByRole('link', { name: 'Manage all tags' })).toBeDefined())
    expect(screen.getByText('Publisher Type')).toHaveClass('sr-only')
    expect(screen.getByRole('link', { name: 'Manage all tags' }).getAttribute('href')).toBe(
      '/source/test-topic/tags/publisher_type',
    )
    expect(screen.getByTestId('manage-tags-content').textContent).toBe('blog')
    expect(mockManageTagsContent.mock.lastCall?.[0]?.enumOptions).toEqual([
      { id: 'pt-1', slug: 'blog', label: 'Blog' },
    ])

    const onRelationsChange = mockManageTagsContent.mock.lastCall?.[0]?.onRelationsChange as
      | (() => void)
      | undefined
    expect(onRelationsChange).toBeTypeOf('function')
    onRelationsChange?.()
    expect(mockFetchEntityRelations).toHaveBeenCalledTimes(2)
    expect(mockNav.refresh).toHaveBeenCalledOnce()
  })

  it('renders an explicit dialog description visibly', async () => {
    render(
      <ManageTagsDialog
        entityType='topic'
        entityId='topic-1'
        predicate='category'
        objectType='topic'
        label='Category'
        heading='Category'
        dialogTitle='Manage categories'
        triggerLabel='Manage'
        dialogDescription='Choose the most accurate categories.'
        loadingText='Loading...'
        errorText='Error loading tags'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Manage' }))

    await waitFor(() => expect(screen.getByTestId('dialog')).toBeDefined())
    expect(screen.getByText('Choose the most accurate categories.')).not.toHaveClass('sr-only')
  })

  it('falls back to an sr-only heading when dialog description is empty', async () => {
    render(
      <ManageTagsDialog
        entityType='topic'
        entityId='topic-1'
        predicate='category'
        objectType='topic'
        label='Category'
        heading='Category'
        dialogTitle='Manage categories'
        triggerLabel='Manage'
        dialogDescription=''
        loadingText='Loading...'
        errorText='Error loading tags'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Manage' }))

    await waitFor(() => expect(screen.getByTestId('dialog')).toBeDefined())
    expect(screen.getByText('Category')).toHaveClass('sr-only')
  })
})
