import type { ListResponse } from '@/types/api-responses'
import type { IndividualCard } from '@/types/my'

export function makeCardsPage(cards: IndividualCard[]): ListResponse<IndividualCard> {
  return {
    results: cards,
    page_info: {
      has_next_page: false,
      start_cursor: cards.length > 0 ? 'start' : null,
      end_cursor: null,
    },
  }
}
