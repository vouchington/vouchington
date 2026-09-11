import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { mockLucideReact } from '@/test-helpers/lucide-icons'

const { mockManageTagsDialog } = vi.hoisted(() => ({
  mockManageTagsDialog: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/components/tags/manage-tags-dialog'),
  () =>
    ({
      ManageTagsDialog: (props: Record<string, unknown>) => {
        mockManageTagsDialog(props)
        const renderTrigger = props.trigger as (open: () => void) => ReactNode
        return <div data-testid='manage-tags-dialog'>{renderTrigger(vi.fn())}</div>
      },
    }) as unknown as typeof import('@/components/tags/manage-tags-dialog'),
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

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    Tag: () => <svg data-testid='tag-icon' />,
  }),
)

vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => (key: string) => {
    if (key === 'extracted.feed.manageCategoriesMenuItem.manageCategories_49cf9ec6') {
      return 'Manage categories'
    }
    if (key === 'extracted.feed.manageCategoriesMenuItem.category_292c06f0') {
      return 'Category'
    }
    if (key === 'extracted.feed.manageCategoriesMenuItem.addOrRemoveCategoryTopicsFor_cdacf600') {
      return 'Add or remove category topics for this news item.'
    }
    if (key === 'extracted.feed.manageCategoriesMenuItem.loading_47d2a515') {
      return 'Loading...'
    }
    if (key === 'extracted.feed.manageCategoriesMenuItem.errorLoadingCategories_a400f101') {
      return 'Error loading categories'
    }
    return key
  },
}))

import { ManageCategoriesMenuItem } from '../manage-categories-menu-item'

describe('ManageCategoriesMenuItem', () => {
  it('renders a manage categories menu item and wires the dialog props', () => {
    render(<ManageCategoriesMenuItem entityId='item-1' />)

    expect(screen.getByRole('menuitem', { name: /manage categories/i })).toBeDefined()
    expect(screen.getByTestId('tag-icon')).toBeDefined()
    expect(screen.getByTestId('manage-tags-dialog')).toBeDefined()
    expect(mockManageTagsDialog.mock.lastCall?.[0]).toMatchObject({
      entityType: 'rss_feed_item',
      entityId: 'item-1',
      predicate: 'category',
      objectType: 'topic',
      heading: 'Category',
      triggerLabel: 'Manage categories',
      dialogTitle: 'Manage categories',
      dialogDescription: 'Add or remove category topics for this news item.',
    })
    expect(typeof mockManageTagsDialog.mock.lastCall?.[0]?.trigger).toBe('function')
  })
})
