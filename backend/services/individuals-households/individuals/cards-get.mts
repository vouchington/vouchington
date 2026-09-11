import { getOrCreateIndividual } from './individuals.mts'
import { currentUserCanAccessUser } from '@services/users/authorization'
import { read } from '@data-stores/psql'
import {
  buildPageInfo,
  decodeScopedUuidCursor,
  parseBoundedIntegerLimit,
} from '@modules/pagination'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import type {
  GetIndividualCardsOptions,
  IndividualCard,
  IndividualCardPage,
} from './cards-types.mts'
import { parsePostgresMoneyAmount, type CurrencyCode } from '@ts-shared/money'

type IndividualCardRow = Omit<
  IndividualCard,
  'card' | 'authorized_user_of_card' | 'credit_limit'
> & {
  credit_limit_minor_units: string | null
  currency_code: CurrencyCode | null
  card_name: string
  card_slug: string
  parent_id: string | null
  parent_opened_on: string | null
  parent_closed_on: string | null
  parent_card_id: string | null
  parent_card_name: string | null
  parent_card_slug: string | null
}

function cardCursorScope(individualId: string): string {
  return `my-cards:${individualId}:id-asc`
}

function toIndividualCard(row: IndividualCardRow): IndividualCard {
  const authorizedUserOfCard =
    row.parent_id && row.parent_card_id && row.parent_card_name && row.parent_card_slug
      ? {
          id: row.parent_id,
          opened_on: row.parent_opened_on,
          closed_on: row.parent_closed_on,
          card: {
            id: row.parent_card_id,
            name: row.parent_card_name,
            slug: row.parent_card_slug,
          },
        }
      : null

  return {
    id: row.id,
    card_id: row.card_id,
    opened_on: row.opened_on,
    closed_on: row.closed_on,
    credit_limit:
      row.credit_limit_minor_units === null || row.currency_code === null
        ? null
        : {
            amount: parsePostgresMoneyAmount(row.credit_limit_minor_units),
            currency: row.currency_code,
          },
    received_sign_up_bonus_on: row.received_sign_up_bonus_on,
    is_authorized_user: row.is_authorized_user,
    authorized_user_of_id: row.authorized_user_of_id,
    note: row.note,
    card: { id: row.card_id, name: row.card_name, slug: row.card_slug },
    authorized_user_of_card: authorizedUserOfCard,
  }
}

export async function getIndividualCards(
  currentUser: PrivateUser | null,
  user: PrivateUser,
  options: GetIndividualCardsOptions = {},
): Promise<IndividualCardPage> {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanAccessUser(currentUser, user.id), 403, 'Forbidden')
  const individual = await getOrCreateIndividual(user)
  const limit = parseBoundedIntegerLimit(options.limit, { default: 25, min: 1, max: 100 })
  const scope = cardCursorScope(individual.id)
  const cursorId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid card cursor').id
    : null
  const query = sql`/* getIndividualCards */
    SELECT
      individual_cards.id,
      individual_cards.card_id,
      individual_cards.opened_on,
      individual_cards.closed_on,
      individual_cards.credit_limit_minor_units::TEXT AS credit_limit_minor_units,
      individual_cards.currency_code,
      individual_cards.received_sign_up_bonus_on,
      COALESCE(individual_cards.is_authorized_user, FALSE) AS is_authorized_user,
      individual_cards.authorized_user_of_id,
      individual_cards.note,
      cards.name AS card_name,
      cards.slug AS card_slug,
      parent.id AS parent_id,
      parent.opened_on AS parent_opened_on,
      parent.closed_on AS parent_closed_on,
      parent.card_id AS parent_card_id,
      parent_cards.name AS parent_card_name,
      parent_cards.slug AS parent_card_slug
    FROM individual_cards
    JOIN view_topics cards
      ON cards.id = individual_cards.card_id
    LEFT JOIN individual_cards parent
      ON parent.id = individual_cards.authorized_user_of_id
      AND parent.individual_id = individual_cards.individual_id
    LEFT JOIN view_topics parent_cards
      ON parent_cards.id = parent.card_id
    WHERE individual_cards.individual_id = ${individual.id}`
  if (cursorId) query.append(sql` AND individual_cards.id > ${cursorId}`)
  query.append(sql`
    ORDER BY individual_cards.id ASC
    LIMIT ${limit + 1}`)
  const { rows } = await read<IndividualCardRow>(query)
  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit).map(toIndividualCard)

  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage,
      getCursor: card => ({ id: card.id, scope }),
    }),
  }
}

export async function getIndividualCardById(
  currentUser: PrivateUser | null,
  user: PrivateUser,
  individualCardId: string,
  options = {},
): Promise<IndividualCard | undefined> {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanAccessUser(currentUser, user.id), 403, 'Forbidden')
  const individual = await getOrCreateIndividual(user)
  const { rows } = await read<IndividualCardRow>(
    sql`/* getIndividualCardById */
    SELECT
      individual_cards.id,
      individual_cards.card_id,
      individual_cards.opened_on,
      individual_cards.closed_on,
      individual_cards.credit_limit_minor_units::TEXT AS credit_limit_minor_units,
      individual_cards.currency_code,
      individual_cards.received_sign_up_bonus_on,
      COALESCE(individual_cards.is_authorized_user, FALSE) AS is_authorized_user,
      individual_cards.authorized_user_of_id,
      individual_cards.note,
      cards.name AS card_name,
      cards.slug AS card_slug,
      parent.id AS parent_id,
      parent.opened_on AS parent_opened_on,
      parent.closed_on AS parent_closed_on,
      parent.card_id AS parent_card_id,
      parent_cards.name AS parent_card_name,
      parent_cards.slug AS parent_card_slug
    FROM individual_cards
    JOIN view_topics cards
      ON cards.id = individual_cards.card_id
    LEFT JOIN individual_cards parent
      ON parent.id = individual_cards.authorized_user_of_id
      AND parent.individual_id = individual_cards.individual_id
    LEFT JOIN view_topics parent_cards
      ON parent_cards.id = parent.card_id
    WHERE individual_cards.id = ${individualCardId}
      AND individual_cards.individual_id = ${individual.id}
    LIMIT 1
  `,
    options,
  )
  return rows[0] ? toIndividualCard(rows[0]) : undefined
}
