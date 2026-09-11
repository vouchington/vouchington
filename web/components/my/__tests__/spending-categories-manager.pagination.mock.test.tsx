import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpendingCategory } from '@/types/my'
import type { CurrencyCode } from '@ts-shared/money'

const { deleteMock, getPageMock, updateMock } = vi.hoisted(() => ({
  deleteMock: vi.fn<VitestLooseMock>(),
  getPageMock: vi.fn<VitestLooseMock>(),
  updateMock: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client'), () => ({
  createMySpendingCategory: vi.fn<VitestLooseMock>(),
  deleteMySpendingCategory: deleteMock,
  getMySpendingCategoriesClient: getPageMock,
  updateMySpendingCategory: updateMock,
}))
vi.mock(import('@/lib/on-error'), () => ({ default: vi.fn<VitestLooseMock>() }))
vi.mock(import('@/lib/on-error/on-success'), () => ({
  onSuccess: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({
    children,
    hasNextPage,
    onLoadMore,
  }: {
    children: React.ReactNode
    hasNextPage: boolean
    onLoadMore: () => Promise<void | boolean>
  }) => (
    <>
      {children}
      {hasNextPage ? (
        <button
          type='button'
          onClick={() => void onLoadMore()}
        >
          Load more
        </button>
      ) : null}
    </>
  ),
}))
vi.mock(import('../spending-categories-manager/add-category-form'), () => ({
  AddCategoryForm: () => <div />,
}))
vi.mock(import('../spending-categories-manager/category-list'), () => ({
  CategoryList: ({
    categories,
    editingId,
    onDelete,
    onSave,
    onStartEdit,
    setEditForm,
  }: {
    categories: SpendingCategory[]
    editingId: string | null
    onDelete: (id: string) => void
    onSave: (id: string) => void
    onStartEdit: (category: SpendingCategory) => void
    setEditForm: (
      updater: (form: {
        amount: string
        currency: CurrencyCode
        spending_frequency: 'monthly' | 'annually'
        note: string
      }) => {
        amount: string
        currency: CurrencyCode
        spending_frequency: 'monthly' | 'annually'
        note: string
      },
    ) => void
  }) => (
    <ul>
      {categories.map(category => (
        <li key={category.id}>
          <span>{category.spending_category.name}</span>
          <button
            type='button'
            onClick={() => onStartEdit(category)}
          >
            Edit {category.id}
          </button>
          {editingId === category.id ? (
            <>
              <button
                type='button'
                onClick={() => setEditForm(form => ({ ...form, note: 'Updated' }))}
              >
                Change {category.id}
              </button>
              <button
                type='button'
                onClick={() => onSave(category.id)}
              >
                Save {category.id}
              </button>
            </>
          ) : null}
          <button
            type='button'
            onClick={() => onDelete(category.id)}
          >
            Delete {category.id}
          </button>
        </li>
      ))}
    </ul>
  ),
}))

import { SpendingCategoriesManager } from '../spending-categories-manager'

describe('SpendingCategoriesManager pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPageMock.mockResolvedValue({
      results: [
        makeCategory('spending-1', 'Duplicate coffee'),
        makeCategory('spending-2', 'Travel'),
      ],
      page_info: { has_next_page: false, start_cursor: 'cursor-2', end_cursor: 'cursor-2' },
    })
    updateMock.mockResolvedValue({
      spending_category: { ...makeCategory('spending-2', 'Updated travel'), note: 'Updated' },
    })
    deleteMock.mockResolvedValue(undefined)
  })

  it('loads, appends, deduplicates, edits, and deletes continuation rows', async () => {
    render(
      <SpendingCategoriesManager
        initialData={{
          results: [makeCategory('spending-1', 'Coffee')],
          page_info: {
            has_next_page: true,
            start_cursor: 'cursor-1',
            end_cursor: 'opaque-cursor',
          },
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(screen.getByText('Travel')).toBeInTheDocument())
    expect(screen.getAllByText(/Coffee|Duplicate coffee/)).toHaveLength(1)
    expect(getPageMock).toHaveBeenCalledWith({
      after: 'opaque-cursor',
      limit: 25,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Edit spending-2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change spending-2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save spending-2' }))
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith('spending-2', { note: 'Updated' }))
    await waitFor(() => expect(screen.getByText('Updated travel')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Delete spending-2' }))
    await waitFor(() => expect(screen.queryByText('Updated travel')).not.toBeInTheDocument())
    expect(deleteMock).toHaveBeenCalledWith('spending-2')
  })
})

function makeCategory(id: string, name: string): SpendingCategory {
  return {
    id,
    spending_category_id: `topic-${id}`,
    amount: { amount: 15_000, currency: 'usd' },
    spending_frequency: 'monthly',
    note: null,
    spending_category: {
      id: `topic-${id}`,
      name,
      slug: name.toLowerCase().replaceAll(' ', '-'),
    },
  }
}
