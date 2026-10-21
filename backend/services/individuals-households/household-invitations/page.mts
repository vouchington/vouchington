import { encodeCursor } from '@modules/pagination'
import type { HouseholdInvitation } from './invitations.mts'

export function page(rows: HouseholdInvitation[], limit: number) {
  const results = rows.slice(0, limit)
  const hasNextPage = rows.length > limit
  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: results[0] ? encodeCursor({ id: results[0].id }) : null,
      end_cursor: hasNextPage && results.at(-1) ? encodeCursor({ id: results.at(-1)!.id }) : null,
    },
  }
}
