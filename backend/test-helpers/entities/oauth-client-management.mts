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

/** Gives an anonymously registered client an owner, as a signed-in registration would. */
export async function assignTestOAuthClientOwner(
  clientId: string,
  ownerUserId: string,
): Promise<void> {
  await write(
    `/* assignTestOAuthClientOwner */ UPDATE oauth_clients
     SET owner_user_id = $2
     WHERE client_id = $1`,
    [clientId, ownerUserId],
  )
}
