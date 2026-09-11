import { usePaginatedList } from '@/hooks/use-paginated-list'
import { getMySpendingCategoriesClient } from '@/lib/api/client'
import type { ListResponse } from '@/types/api-responses'
import type { SpendingCategory } from '@/types/my'

export function useSpendingCategoryPagination(initialData: ListResponse<SpendingCategory>) {
  return usePaginatedList(
    initialData,
    '/api/v1/my/spending-categories',
    { limit: 25 },
    {
      loadPage: after => getMySpendingCategoriesClient({ after, limit: 25 }),
    },
  )
}
