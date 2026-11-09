import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import onError from '@modules/on-error'

export async function revokeApiKey(currentUserId: string, apiKeyId: string): Promise<boolean> {
  try {
    await using query = await beginTransaction()
    const result = await query(sql`/* revokeApiKey */
        UPDATE api_keys
        SET revoked_at = NOW()
        WHERE id = ${apiKeyId}::uuid
          AND user_id = ${currentUserId}::uuid
          AND revoked_at IS NULL
          AND EXISTS (SELECT 1 FROM users WHERE id = ${currentUserId}::uuid AND deleted_at IS NULL)
      `)
    await query.commit()
    const rowCount = result.rowCount
    return rowCount === 1
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    throw err
  }
}
