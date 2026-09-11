import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import createError from 'http-errors'
import { isEmailAddress } from '@ts-shared/utils/validation-core'
import { isPhoneNumber, isUUID, isUsername, verifyPhoneNumber } from '@modules/utils'
import {
  buildOrderedInputCtes,
  normalizeBatchIdentifiers,
  partitionBatchIdentifiers,
  scatterOrderedRows,
} from '@services/batch-lookup'
import type { PrivateUser } from './types.mts'

export const getPrivateUsersByAnyBatch = async (
  identifiers: string[],
  options: QueryOptions = {},
): Promise<Array<PrivateUser | null | undefined>> => {
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
    if (isEmailAddress(trimmed)) {
      return { value: trimmed.toLowerCase(), type: 'email' }
    }
    if (isPhoneNumber(trimmed)) {
      return { value: verifyPhoneNumber(trimmed), type: 'phone' }
    }
    throw createError(422, `Invalid user identifier: ${input}`)
  })

  const partitions = partitionBatchIdentifiers(normalizedInputs)
  const inputCtes = buildOrderedInputCtes([
    { cteName: 'id_input', sqlType: 'uuid', inputs: partitions.get('id') ?? [] },
    { cteName: 'username_input', sqlType: 'text', inputs: partitions.get('username') ?? [] },
    { cteName: 'email_input', sqlType: 'text', inputs: partitions.get('email') ?? [] },
    { cteName: 'phone_input', sqlType: 'text', inputs: partitions.get('phone') ?? [] },
  ])

  const { rows } = await read(
    `/* getPrivateUsersByAnyBatch */
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
    email_lookups AS (
      SELECT DISTINCT ON (matches.input_order) u.id, matches.input_order
      FROM (
        SELECT uea.user_id, ei.input_order FROM email_input ei JOIN user_email_addresses uea ON uea.email_address = ei.input_value
        UNION ALL
        SELECT fa.user_id, ei.input_order FROM email_input ei JOIN facebook_accounts fa ON fa.facebook_user_email_address = ei.input_value
        UNION ALL
        SELECT aa.user_id, ei.input_order FROM email_input ei JOIN apple_accounts aa ON aa.apple_user_email_address = ei.input_value
        UNION ALL
        SELECT ga.user_id, ei.input_order FROM email_input ei JOIN google_accounts ga ON ga.google_user_email_address = ei.input_value
        UNION ALL
        SELECT xa.user_id, ei.input_order FROM email_input ei JOIN x_accounts xa ON xa.x_user_email_address = ei.input_value
        UNION ALL
        SELECT la.user_id, ei.input_order FROM email_input ei JOIN linkedin_accounts la ON la.linkedin_user_email_address = ei.input_value
        UNION ALL
        SELECT ma.user_id, ei.input_order FROM email_input ei JOIN microsoft_accounts ma ON ma.microsoft_user_email_address = ei.input_value
      ) matches
      JOIN users u ON u.id = matches.user_id
      WHERE u.deleted_at IS NULL
      ORDER BY matches.input_order, u.id
    ),
    phone_lookups AS (
      SELECT DISTINCT ON (phone_input.input_order) u.id, phone_input.input_order
      FROM phone_input
      JOIN user_phone_numbers upn ON upn.phone_number = phone_input.input_value
      JOIN users u ON u.id = upn.user_id
      WHERE u.deleted_at IS NULL
      ORDER BY phone_input.input_order, u.id
    ),
    combined_ids AS (
      SELECT id, input_order FROM id_lookups
      UNION
      SELECT id, input_order FROM username_lookups
      UNION
      SELECT id, input_order FROM email_lookups
      UNION
      SELECT id, input_order FROM phone_lookups
    )
    SELECT vup.*, ci.input_order
    FROM view_users_private vup
    JOIN combined_ids ci ON ci.id = vup.id
    ORDER BY ci.input_order
  `,
    inputCtes.values,
    options,
  )

  return scatterOrderedRows(identifiers.length, rows, row => {
    const { input_order: _input_order, ...userData } = row
    return userData as PrivateUser
  })
}
