import { read, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'

type Individual = { id: string; updated_at: Date }

/**
 * Get the individual that represents this user
 */
async function getIndividual(currentUser: PrivateUser | null, options: QueryOptions = {}) {
  assert(currentUser, 401, 'User not logged in')

  const {
    rows: [individual],
  } = await read<Individual>(
    sql`/* getIndividual */
    SELECT
      individual.id,
      individual.updated_at
    FROM users
    LEFT JOIN individuals individual ON individual.id = users.individual_id
    WHERE users.id = ${currentUser.id}
    LIMIT 1
  `,
    options,
  )

  return individual?.id ? individual : null
}

/**
 * Create a new individual
 * If this is the first individual for the user, it will be set as their representative individual
 */
async function createIndividual(currentUser: PrivateUser | null, options: QueryOptions = {}) {
  assert(currentUser, 401, 'User not logged in')

  // Check if user already has a representative individual
  const user = await getRepresentativeIndividualUser(currentUser.id, options)

  const isFirstIndividual = !user?.individual_id

  if (isFirstIndividual) {
    return createRepresentativeIndividual(currentUser.id, options)
  }

  return createAdditionalIndividual(options)
}

/**
 * Get or create individual for the user
 * This ensures the user has an individual (should be automatic via trigger, but this is a fallback)
 */
export async function getOrCreateIndividual(
  currentUser: PrivateUser | null,
  options: QueryOptions = {},
) {
  const existing = await getIndividual(currentUser, options)
  if (existing) return existing
  return createIndividual(currentUser, options)
}

async function getRepresentativeIndividualUser(userId: string, options: QueryOptions = {}) {
  const {
    rows: [user],
  } = await read<{ individual_id: string | null }>(
    sql`/* getRepresentativeIndividualUser */
    SELECT individual_id
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `,
    options,
  )

  return user
}

async function createRepresentativeIndividual(userId: string, options: QueryOptions = {}) {
  const {
    rows: [individual],
  } = await write<Individual>(
    sql`/* createRepresentativeIndividual */
    WITH new_individual AS (
      INSERT INTO individuals DEFAULT VALUES
      RETURNING id, updated_at
    )
    UPDATE users
    SET individual_id = new_individual.id
    FROM new_individual
    WHERE users.id = ${userId}
    RETURNING new_individual.id, new_individual.updated_at
  `,
    options,
  )

  return individual
}

async function createAdditionalIndividual(options: QueryOptions = {}) {
  const {
    rows: [individual],
  } = await write<Individual>(
    sql`/* createAdditionalIndividual */
    INSERT INTO individuals DEFAULT VALUES
    RETURNING id, updated_at
  `,
    options,
  )

  return individual
}
