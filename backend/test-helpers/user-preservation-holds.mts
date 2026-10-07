import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptSecret } from '@modules/token-secrets'
import type { UserPreservationHold } from '../services/users/preservation-holds.mts'

export async function readTestUserPreservationHolds(
  userId: string,
): Promise<UserPreservationHold[]> {
  const { rows } = await read<{
    id: string
    account_user_id: string
    placed_by_id: string
    reference_ciphertext: string
    released_at: Date | null
    released_by_id: string | null
    created_at: Date
  }>(sql`
    SELECT id, account_user_id, placed_by_id, reference_ciphertext,
      released_at, released_by_id, created_at
    FROM user_legal_preservation_holds
    WHERE account_user_id = ${userId}
    ORDER BY id DESC
  `)
  return rows.map(row => ({
    id: row.id,
    account_user_id: row.account_user_id,
    reference: decryptSecret(row.reference_ciphertext, `user-legal-preservation-hold:${row.id}`),
    placed_by_id: row.placed_by_id,
    placed_at: row.created_at,
    released_by_id: row.released_by_id,
    released_at: row.released_at,
  }))
}
