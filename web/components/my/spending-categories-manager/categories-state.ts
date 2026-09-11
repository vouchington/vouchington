import type { ListResponse } from '@/types/api-responses'
import type { SpendingCategory, SpendingFrequency, UpdateMySpendingCategoryBody } from '@/types/my'
import type { Money } from '@ts-shared/money'

export type SpendingCategoryPageInput =
  | ListResponse<SpendingCategory>
  | { results: SpendingCategory[]; page_info?: undefined }

export function normalizeSpendingCategoryPage(
  page: SpendingCategoryPageInput,
): ListResponse<SpendingCategory> {
  return page.page_info
    ? page
    : {
        results: page.results,
        page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      }
}

export interface SpendingCategoryListOverlay {
  upserts: Map<string, SpendingCategory>
  deletedIds: Set<string>
}

export interface SpendingCategoriesManagerProps {
  initialData?: SpendingCategoryPageInput
  /** Kept for already-deployed server component payloads during the API expansion. */
  initialSpendingCategories?: SpendingCategory[]
}

export function mergeSpendingCategoryPages(
  pages: Array<ListResponse<SpendingCategory>>,
  overlay: SpendingCategoryListOverlay,
): SpendingCategory[] {
  const categoriesById = new Map<string, SpendingCategory>()
  for (const page of pages) {
    for (const category of page.results) categoriesById.set(category.id, category)
  }
  for (const [id, category] of overlay.upserts) categoriesById.set(id, category)
  for (const deletedId of overlay.deletedIds) categoriesById.delete(deletedId)
  return [...categoriesById.values()]
}

export function buildSpendingCategoryUpdatePayload(
  original: SpendingCategory | undefined,
  amount: Money,
  spendingFrequency: SpendingFrequency,
  note: string | null,
): UpdateMySpendingCategoryBody | undefined {
  const amountChanged =
    !original ||
    amount.amount !== original.amount.amount ||
    amount.currency !== original.amount.currency
  const frequencyChanged = !original || spendingFrequency !== original.spending_frequency
  const noteChanged = !original || note !== original.note

  if (amountChanged) {
    return {
      amount,
      ...(frequencyChanged && { spending_frequency: spendingFrequency }),
      ...(noteChanged && { note }),
    }
  }
  if (frequencyChanged) {
    return {
      spending_frequency: spendingFrequency,
      ...(noteChanged && { note }),
    }
  }
  if (noteChanged) return { note }
  return undefined
}
