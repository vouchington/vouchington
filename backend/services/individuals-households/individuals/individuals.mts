import {
  beginTransaction,
  read,
  withTransactionOptions,
  write,
  type TransactionQuery,
} from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'

type Individual = { id: string; updated_at: Date }

/**
 * Get the individual that represents this user
 */
async function getIndividual(
  currentUser: PrivateUser | null,
  options: QueryOptions = {},
  primary = false,
) {
  assert(currentUser, 401, 'User not logged in')

  const {
    rows: [individual],
  } = await (primary ? write : read)<Individual>(
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

/** Get or create the user's representative individual. */
export async function getOrCreateIndividual(
  currentUser: PrivateUser | null,
  options: QueryOptions = {},
) {
  assert(currentUser, 401, 'User not logged in')
  const existing = await getIndividual(currentUser, options)
  if (existing) return existing

  const bind = async (query: TransactionQuery) => {
    const transactionOptions = { query }
    // The first read can use a replica. Recheck the primary before inserting.
    const linked = await getIndividual(currentUser, transactionOptions, true)
    if (linked) return linked
    return (
      (await createRepresentativeIndividual(currentUser.id, transactionOptions)) ??
      (await getIndividual(currentUser, transactionOptions, true))
    )
  }
  if (options.query || options.client) return withTransactionOptions(options, bind)
  await using query = await beginTransaction()
  const individual = await bind(query)
  await query.commit()
  return individual
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
    WHERE users.id = ${userId} AND users.individual_id IS NULL
    RETURNING new_individual.id, new_individual.updated_at
  `,
    options,
  )

  return individual
}
