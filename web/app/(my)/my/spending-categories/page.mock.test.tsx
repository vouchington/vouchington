import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { SpendingCategoriesManagerProps } from '@/components/my/spending-categories-manager/categories-state'

const { getMySpendingCategoriesMock } = vi.hoisted(() => ({
  getMySpendingCategoriesMock: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getMySpendingCategories: getMySpendingCategoriesMock,
}))
vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: async () => (key: string) => key,
}))
vi.mock(import('@/components/my/spending-categories-manager'), () => ({
  SpendingCategoriesManager: ({
    initialData,
    initialSpendingCategories,
  }: SpendingCategoriesManagerProps) => {
    const results = initialData?.results ?? initialSpendingCategories ?? []
    return (
      <div data-testid='spending-categories-page-data'>
        {`${results[0]?.spending_category.name}|${initialData?.page_info?.end_cursor ?? ''}`}
      </div>
    )
  },
}))

import SpendingCategoriesPage from './page'

describe('SpendingCategoriesPage', () => {
  it('passes the complete bounded first page to the manager', async () => {
    getMySpendingCategoriesMock.mockResolvedValue({
      results: [
        {
          id: 'spending-1',
          spending_category: { name: 'Coffee' },
        },
      ],
      page_info: {
        has_next_page: true,
        start_cursor: 'cursor-start',
        end_cursor: 'cursor-end',
      },
    })

    render(await SpendingCategoriesPage())

    expect(getMySpendingCategoriesMock).toHaveBeenCalledWith({ limit: 25 })
    expect(screen.getByTestId('spending-categories-page-data')).toHaveTextContent(
      'Coffee|cursor-end',
    )
  })
})
