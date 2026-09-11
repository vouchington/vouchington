import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'

export async function renamePasskey(
  currentUserId: string,
  passkeyId: string,
  name: string,
): Promise<void> {
  const { rowCount } = await write(sql`/* renamePasskey */
    UPDATE user_passkeys
    SET name = ${name}
    WHERE id = ${passkeyId} AND user_id = ${currentUserId}
  `)
  assert(rowCount === 1, 404, 'Passkey not found')
}

export async function updatePasskeyCounter(
  passkeyId: string,
  newCounter: number,
): Promise<boolean> {
  const { rowCount } = await write(sql`/* updatePasskeyCounter */
    UPDATE user_passkeys
    SET counter = ${newCounter}, last_used_at = NOW()
    WHERE id = ${passkeyId}
      AND (counter < ${newCounter} OR (counter = 0 AND ${newCounter} = 0))
  `)
  return rowCount === 1
}
