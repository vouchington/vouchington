import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import createError from 'http-errors'
import { isUUID, isUsername } from '@modules/utils'
import {
  queryOrderedIdentifierBatch,
  type NormalizedBatchIdentifier,
  type OrderedBatchPartition,
} from '@services/batch-lookup'
import type { PublicUser } from './types.mts'

const publicUserBatchPartitions: readonly OrderedBatchPartition<'id' | 'username'>[] = [
  { cteName: 'id_input', sqlType: 'uuid', type: 'id' },
  { cteName: 'username_input', sqlType: 'text', type: 'username' },
]

export const getPublicUsersByAnyBatch = async (
  identifiers: string[],
  options: QueryOptions = {},
): Promise<Array<PublicUser | null | undefined>> =>
  queryOrderedIdentifierBatch<PublicUser, 'id' | 'username', QueryOptions>(identifiers, options, {
    normalize: normalizePublicUserBatchIdentifier,
    partitions: publicUserBatchPartitions,
    statement: publicUserBatchStatement,
    readRows: readPublicUserBatchRows,
  })

function normalizePublicUserBatchIdentifier(
  input: string,
): Omit<NormalizedBatchIdentifier<'id' | 'username'>, 'index'> {
  const trimmed = input.trim()

  if (isUUID(trimmed)) {
    return { value: trimmed, type: 'id' }
  }
  if (isUsername(trimmed)) {
    return { value: trimmed.toLowerCase(), type: 'username' }
  }
  throw createError(422, `Invalid user identifier: ${input}`)
}

function publicUserBatchStatement(inputCtes: string): string {
  return `/* getPublicUsersByAnyBatch */
    WITH ${inputCtes},
    id_lookups AS (
      SELECT u.id, id_input.input_order
      FROM users u
      JOIN id_input ON u.id = id_input.input_value
      WHERE u.deleted_at IS NULL
    ),
    username_lookups AS (
      SELECT u.id, username_input.input_order
      FROM users u
      JOIN username_input ON LOWER(u.username) = username_input.input_value
      WHERE u.deleted_at IS NULL
    ),
    combined_ids AS (
      SELECT id, input_order FROM id_lookups
      UNION
      SELECT id, input_order FROM username_lookups
    )
    SELECT vup.*, ci.input_order
    FROM view_users_public vup
    JOIN combined_ids ci ON ci.id = vup.id
    ORDER BY ci.input_order
  `
}

async function readPublicUserBatchRows(
  sql: string,
  values: unknown[],
  options: QueryOptions,
): Promise<ReadonlyArray<PublicUser & { input_order: number }>> {
  const { rows } = await read<PublicUser & { input_order: number }>(sql, values, options)
  return rows
}
