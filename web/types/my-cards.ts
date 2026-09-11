export interface IndividualCardTopicSummary {
  id: string
  name: string
  slug: string
}

export interface AuthorizedUserOfCardSummary {
  id: string
  opened_on: string | null
  closed_on: string | null
  card: IndividualCardTopicSummary
}

export interface IndividualCard {
  id: string
  card_id: string
  opened_on: string | null
  closed_on: string | null
  received_sign_up_bonus_on: string | null
  credit_limit: Money | null
  is_authorized_user: boolean
  authorized_user_of_id: string | null
  note: string | null
  card: IndividualCardTopicSummary
  authorized_user_of_card: AuthorizedUserOfCardSummary | null
}

export interface CreateMyCardBody {
  card_id: string
}

export interface UpdateMyCardBody {
  opened_on?: string | null
  closed_on?: string | null
  received_sign_up_bonus_on?: string | null
  credit_limit?: Money | null
  is_authorized_user?: boolean
  authorized_user_of_id?: string | null
  note?: string | null
}
import type { Money } from '@ts-shared/money'
