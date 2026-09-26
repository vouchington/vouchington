import type { ListResponse } from '@/types/api-responses'
import type { IndividualCard } from '@/types/my'

export const initialCards: IndividualCard[] = [
  {
    id: 'card-owner-1',
    card_id: 'c-1',
    opened_on: '2023-01-01',
    closed_on: null,
    received_sign_up_bonus_on: null,
    credit_limit: { amount: 1_000_000, currency: 'usd' },
    is_authorized_user: false,
    authorized_user_of_id: null,
    note: 'My Chase Sapphire Card',
    authorized_user_of_card: null,
    card: { id: 'c-1', name: 'Chase Sapphire Preferred', slug: 'csp' },
  },
  {
    id: 'card-owner-2',
    card_id: 'c-2',
    opened_on: '2024-02-02',
    closed_on: null,
    received_sign_up_bonus_on: null,
    credit_limit: { amount: 500_000, currency: 'usd' },
    is_authorized_user: true,
    authorized_user_of_id: 'card-owner-1',
    note: 'Authorized User Note',
    authorized_user_of_card: null,
    card: { id: 'c-2', name: 'Chase Freedom Flex', slug: 'cff' },
  },
]

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
