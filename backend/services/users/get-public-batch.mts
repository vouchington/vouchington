import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import createError from 'http-errors'
import { isUUID, isUsername } from '@modules/utils'
import {
  buildOrderedInputCtes,
  normalizeBatchIdentifiers,
  partitionBatchIdentifiers,
  scatterOrderedRows,
} from '@services/batch-lookup'
import type { PublicUser } from './types.mts'

export const getPublicUsersByAnyBatch = async (
  identifiers: string[],
  options: QueryOptions = {},
): Promise<Array<PublicUser | null | undefined>> => {
  if (identifiers.length === 0) {
    return []
  }

  const normalizedInputs = normalizeBatchIdentifiers(identifiers, input => {
    const trimmed = input.trim()

    if (isUUID(trimmed)) {
      return { value: trimmed, type: 'id' }
    }
    if (isUsername(trimmed)) {
      return { value: trimmed.toLowerCase(), type: 'username' }
    }
    throw createError(422, `Invalid user identifier: ${input}`)
  })

  const partitions = partitionBatchIdentifiers(normalizedInputs)
  const inputCtes = buildOrderedInputCtes([
    { cteName: 'id_input', sqlType: 'uuid', inputs: partitions.get('id') ?? [] },
    { cteName: 'username_input', sqlType: 'text', inputs: partitions.get('username') ?? [] },
  ])

  const { rows } = await read(
    `/* getPublicUsersByAnyBatch */
    WITH ${inputCtes.ctes},
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
  `,
    inputCtes.values,
    options,
  )

  return scatterOrderedRows(identifiers.length, rows, row => {
    const { input_order: _input_order, ...userData } = row
    return userData as PublicUser
  })
}
