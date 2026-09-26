import { write } from '@data-stores/psql'

/** Records staff verification directly, for tests that only need a verified client. */
export async function setTestOAuthClientVerified(id: string, verifiedById: string): Promise<void> {
  await write(
    `/* setTestOAuthClientVerified */ UPDATE oauth_clients
     SET verified_at = CURRENT_TIMESTAMP, verified_by_id = $2
     WHERE id = $1`,
    [id, verifiedById],
  )
}

/**
 * Gives an anonymously registered client an owner, as a signed-in registration would, and returns
 * the app id that the owner's management calls take.
 */
export async function assignTestOAuthClientOwner(
  clientId: string,
  ownerUserId: string,
): Promise<string> {
  const { rows } = await write<{ id: string }>(
    `/* assignTestOAuthClientOwner */ UPDATE oauth_clients
     SET owner_user_id = $2
     WHERE client_id = $1
     RETURNING id`,
    [clientId, ownerUserId],
  )
  const row = rows[0]
  if (!row) throw new Error(`OAuth client ${clientId} does not exist`)
  return row.id
}
