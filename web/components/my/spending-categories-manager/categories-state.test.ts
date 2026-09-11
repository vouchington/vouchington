import { describe, expect, it } from 'vitest'
import { buildSpendingCategoryUpdatePayload, mergeSpendingCategoryPages } from './categories-state'
import type { ListResponse } from '@/types/api-responses'
import type { SpendingCategory } from '@/types/my'

const terminalPageInfo = {
  has_next_page: false,
  start_cursor: null,
  end_cursor: null,
}

describe('mergeSpendingCategoryPages', () => {
  it('appends pages, deduplicates IDs, and applies mutation overlays', () => {
    const first = makeCategory('category-1', 'Coffee')
    const duplicate = makeCategory('category-1', 'Stale coffee')
    const second = makeCategory('category-2', 'Travel')
    const created = makeCategory('category-3', 'Groceries')
    const pages: Array<ListResponse<SpendingCategory>> = [
      { results: [first], page_info: terminalPageInfo },
      { results: [duplicate, second], page_info: terminalPageInfo },
    ]

    expect(
      mergeSpendingCategoryPages(pages, {
        upserts: new Map([
          ['category-2', { ...second, note: 'Updated' }],
          ['category-3', created],
        ]),
        deletedIds: new Set(['category-1']),
      }),
    ).toEqual([{ ...second, note: 'Updated' }, created])
  })

  it('builds only changed update fields', () => {
    const category = makeCategory('category-1', 'Coffee')
    expect(
      buildSpendingCategoryUpdatePayload(
        category,
        { amount: 10_000, currency: 'usd' },
        'monthly',
        'Updated',
      ),
    ).toEqual({ note: 'Updated' })
  })

  it('returns undefined when no fields changed', () => {
    const category = makeCategory('category-1', 'Coffee')

    expect(
      buildSpendingCategoryUpdatePayload(
        category,
        category.amount,
        category.spending_frequency,
        category.note,
      ),
    ).toBeUndefined()
  })
})

function makeCategory(id: string, name: string): SpendingCategory {
  return {
    id,
    spending_category_id: `topic-${id}`,
    amount: { amount: 10_000, currency: 'usd' },
    spending_frequency: 'monthly',
    note: null,
    spending_category: {
      id: `topic-${id}`,
      name,
      slug: name.toLowerCase(),
    },
  }
}
