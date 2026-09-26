import { beginTransaction, write } from '@data-stores/psql'
import {
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from '../postgres-lock-wait.mts'

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

/**
 * Replaces a client's redirect URIs in a transaction that commits only once the operation started
 * by `start` is blocked on the client row, so that operation must decide against the new URIs.
 */
export async function replaceTestOAuthRedirectUrisWhileWaiting<T>(input: {
  clientId: string
  redirectUris: string[]
  waiterQueryMarker: string
  start: () => Promise<T>
}): Promise<T> {
  let operation: Promise<T>
  {
    await using transaction = await beginTransaction()
    await transaction(
      `/* replaceTestOAuthRedirectUrisWhileWaiting */ UPDATE oauth_clients
       SET redirect_uris = $2::text[]
       WHERE client_id = $1`,
      [input.clientId, input.redirectUris],
    )
    const holderProcessId = await getTestPostgresBackendProcessId(transaction)
    operation = input.start()
    await waitForTestPostgresLockWaiter(holderProcessId, input.waiterQueryMarker)
    await transaction.commit()
  }
  return operation
}
