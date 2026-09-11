import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'

/**
 * Get the individual that represents this user
 */
async function getIndividual(currentUser: PrivateUser | null) {
  assert(currentUser, 401, 'User not logged in')

  // Check if the user already has an individual in the database
  const {
    rows: [user],
  } = await read(sql`/* getIndividual */
    SELECT individual_id
    FROM users
    WHERE id = ${currentUser.id}
    LIMIT 1
  `)

  if (!user?.individual_id) {
    return null
  }

  const {
    rows: [individual],
  } = await read(sql`/* getIndividual */
    SELECT
      id,
      updated_at
    FROM individuals
    WHERE id = ${user.individual_id}
    LIMIT 1
  `)

  return individual || null
}

/**
 * Create a new individual
 * If this is the first individual for the user, it will be set as their representative individual
 */
async function createIndividual(currentUser: PrivateUser | null) {
  assert(currentUser, 401, 'User not logged in')

  // Check if user already has a representative individual
  const user = await getRepresentativeIndividualUser(currentUser.id)

  const isFirstIndividual = !user?.individual_id

  if (isFirstIndividual) {
    return createRepresentativeIndividual(currentUser.id)
  }

  return createAdditionalIndividual()
}

/**
 * Get or create individual for the user
 * This ensures the user has an individual (should be automatic via trigger, but this is a fallback)
 */
export async function getOrCreateIndividual(currentUser: PrivateUser | null) {
  const existing = await getIndividual(currentUser)
  if (existing) return existing
  return await createIndividual(currentUser)
}

async function getRepresentativeIndividualUser(userId: string) {
  const {
    rows: [user],
  } = await read(sql`/* getRepresentativeIndividualUser */
    SELECT individual_id
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `)

  return user as { individual_id?: string | null } | undefined
}

async function createRepresentativeIndividual(userId: string) {
  const {
    rows: [individual],
  } = await write(sql`/* createRepresentativeIndividual */
    WITH new_individual AS (
      INSERT INTO individuals DEFAULT VALUES
      RETURNING *
    )
    UPDATE users
    SET individual_id = new_individual.id
    FROM new_individual
    WHERE users.id = ${userId}
    RETURNING new_individual.id, new_individual.updated_at
  `)

  return individual
}

async function createAdditionalIndividual() {
  const {
    rows: [individual],
  } = await write(sql`/* createAdditionalIndividual */
    INSERT INTO individuals DEFAULT VALUES
    RETURNING *
  `)

  return individual
}
