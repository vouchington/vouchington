import type { PageInfo } from '@voucha/types/pagination'
import type { Money } from '@ts-shared/money'

export type IndividualCardTopicSummary = {
  id: string
  name: string
  slug: string
}

export type AuthorizedUserOfCardSummary = {
  id: string
  opened_on: string | null
  closed_on: string | null
  card: IndividualCardTopicSummary
}

export type IndividualCard = {
  id: string
  card_id: string
  opened_on: string | null
  closed_on: string | null
  credit_limit: Money | null
  received_sign_up_bonus_on: string | null
  is_authorized_user: boolean
  authorized_user_of_id: string | null
  note: string | null
  card: IndividualCardTopicSummary
  authorized_user_of_card: AuthorizedUserOfCardSummary | null
}

export type IndividualCardPage = {
  results: IndividualCard[]
  page_info: PageInfo
}

export type GetIndividualCardsOptions = {
  limit?: number
  after?: string
}
