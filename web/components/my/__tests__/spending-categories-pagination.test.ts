import { describe, expect, it } from 'vitest'
import {
  mergeSpendingCategoryPages,
  normalizeSpendingCategoryPage,
} from '../spending-categories-manager/categories-state'
import type { SpendingCategory } from '@/types/my'

describe('spending category continuation state', () => {
  it('normalizes cursor metadata and deduplicates continuation rows by id', () => {
    const first = normalizeSpendingCategoryPage({
      results: [category('personal', 100)],
      page_info: { has_next_page: true, end_cursor: 'next', start_cursor: 'first' },
    })
    const second = normalizeSpendingCategoryPage({
      results: [category('personal', 200), category('member', 300, false)],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: 'next' },
    })

    expect(first.page_info).toMatchObject({ has_next_page: true, end_cursor: 'next' })
    expect(
      mergeSpendingCategoryPages([first, second], {
        upserts: new Map(),
        deletedIds: new Set(),
      }),
    ).toEqual([category('personal', 200), category('member', 300, false)])
  })
})

function category(id: string, amount: number, canManage = true): SpendingCategory {
  return {
    id,
    spending_category_id: `${id}-topic`,
    amount: { amount, currency: 'usd' },
    spending_frequency: 'monthly' as const,
    note: null,
    owner_type: canManage ? ('individual' as const) : ('household' as const),
    can_manage: canManage,
    spending_category: { id: `${id}-topic`, name: id, slug: id },
  }
}
