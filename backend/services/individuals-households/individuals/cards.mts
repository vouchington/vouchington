import { getOrCreateIndividual } from './individuals.mts'
import { getIndividualCardById } from './cards-get.mts'
import { normalizeIndividualCardDate } from './card-values.mts'
import { currentUserCanAccessUser } from '@services/users/authorization'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { isMoney, type Money } from '@ts-shared/money'
import { mapIndividualCardConstraintError } from './card-errors.mts'

type UpdateIndividualCardData = {
  opened_on?: string | Date | null
  closed_on?: string | Date | null
  received_sign_up_bonus_on?: string | Date | null
  credit_limit?: Money | null
  is_authorized_user?: boolean
  authorized_user_of_id?: string | null
  note?: string | null
}

async function assertAuthorizedUserOfCard(
  value: string,
  individualId: string,
  individualCardId: string,
  isAuthorizedUser: boolean | undefined,
): Promise<void> {
  const { rows: authRows } = await read(
    sql`/* assertAuthorizedUserOfCard */ SELECT id FROM individual_cards WHERE id = ${value} AND individual_id = ${individualId} LIMIT 1`,
  )
  assert(authRows[0], 422, 'authorized_user_of_id must be a card belonging to you')
  let effectiveIsAuthorizedUser = isAuthorizedUser
  if (effectiveIsAuthorizedUser === undefined) {
    const { rows: existing } = await read(
      sql`/* assertAuthorizedUserOfCard */ SELECT is_authorized_user FROM individual_cards WHERE id = ${individualCardId} AND individual_id = ${individualId} LIMIT 1`,
    )
    effectiveIsAuthorizedUser = existing[0]?.is_authorized_user
  }
  assert(
    effectiveIsAuthorizedUser !== false,
    422,
    'is_authorized_user must be true when authorized_user_of_id is set',
  )
}

export async function createIndividualCard(
  currentUser: PrivateUser | null,
  user: PrivateUser,
  cardId: string,
) {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanAccessUser(currentUser, user.id), 403, 'Forbidden')
  const {
    rows: [topic],
  } = await read(
    sql`/* createIndividualCard */ SELECT topic_type FROM topics WHERE id = ${cardId} AND deleted_at IS NULL AND merged_into_topic_id IS NULL LIMIT 1`,
  )
  assert(topic, 422, 'Invalid card_id')
  assert(topic.topic_type === 'card', 422, 'Invalid card_id')
  const individual = await getOrCreateIndividual(user)
  let rows: { id: string }[]
  try {
    ;({ rows } = await write(sql`/* createIndividualCard */
      INSERT INTO individual_cards (
        individual_id,
        card_id
      )
      VALUES (
        ${individual.id},
        ${cardId}
      )
      RETURNING id
    `))
  } catch (error) {
    const pgError = error as { code?: string }
    if (pgError.code === '23503') {
      assert(false, 422, 'Invalid card_id')
    }
    throw error
  }
  const card = await getIndividualCardById(currentUser, user, rows[0].id, { readOnly: false })
  assert(card, 500, 'Created card could not be loaded')
  return card
}

export async function updateIndividualCardById(
  currentUser: PrivateUser | null,
  user: PrivateUser,
  individualCardId: string,
  data: UpdateIndividualCardData,
) {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanAccessUser(currentUser, user.id), 403, 'Forbidden')
  const individual = await getOrCreateIndividual(user)
  const sets: string[] = []
  const values: unknown[] = []

  if (data.opened_on !== undefined) {
    const value = normalizeIndividualCardDate(data.opened_on, 'opened_on')
    sets.push(`opened_on = $${values.push(value)}`)
  }
  if (data.closed_on !== undefined) {
    const value = normalizeIndividualCardDate(data.closed_on, 'closed_on')
    sets.push(`closed_on = $${values.push(value)}`)
  }
  if (data.received_sign_up_bonus_on !== undefined) {
    const value = normalizeIndividualCardDate(
      data.received_sign_up_bonus_on,
      'received_sign_up_bonus_on',
    )
    sets.push(`received_sign_up_bonus_on = $${values.push(value)}`)
  }
  if (data.credit_limit !== undefined) {
    if (data.credit_limit !== null) {
      assert(isMoney(data.credit_limit), 422, 'credit_limit must be valid money')
      sets.push(`credit_limit_minor_units = $${values.push(data.credit_limit.amount)}`)
      sets.push(`currency_code = $${values.push(data.credit_limit.currency)}`)
    } else {
      sets.push('credit_limit_minor_units = NULL')
      sets.push('currency_code = NULL')
    }
  }
  if (data.is_authorized_user !== undefined) {
    sets.push(`is_authorized_user = $${values.push(!!data.is_authorized_user)}`)
  }
  if (data.authorized_user_of_id !== undefined) {
    const value = data.authorized_user_of_id || null
    if (value !== null) {
      assert(value !== individualCardId, 422, 'authorized_user_of_id cannot be the card itself')
      await assertAuthorizedUserOfCard(
        value,
        individual.id,
        individualCardId,
        data.is_authorized_user,
      )
    }
    sets.push(`authorized_user_of_id = $${values.push(value)}`)
  }
  if (data.note !== undefined) {
    sets.push(`note = $${values.push(data.note || null)}`)
  }

  assert(sets.length > 0, 422, 'No valid fields provided')

  const query = `/* updateIndividualCardById */
    UPDATE individual_cards
    SET ${sets.join(', ')}
    WHERE id = $${values.push(individualCardId)}
      AND individual_id = $${values.push(individual.id)}
    RETURNING id
  `

  const { rows } = await mapIndividualCardConstraintError(() =>
    write<{ id: string }>(query, values),
  )
  assert(rows[0], 404, 'Not found')
  const card = await getIndividualCardById(currentUser, user, rows[0].id, { readOnly: false })
  assert(card, 500, 'Updated card could not be loaded')
  return card
}

export async function deleteIndividualCardById(
  currentUser: PrivateUser | null,
  user: PrivateUser,
  individualCardId: string,
) {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanAccessUser(currentUser, user.id), 403, 'Forbidden')
  const individual = await getOrCreateIndividual(user)
  const {
    rows: [individualCard],
  } = await write(sql`/* deleteIndividualCardById */
    DELETE FROM individual_cards
    WHERE id = ${individualCardId}
      AND individual_id = ${individual.id}
    RETURNING *
  `)
  assert(individualCard, 404, 'Not found')
  return individualCard
}
