import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
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

type OperationWaitingOnClient<T> = {
  clientId: string
  waiterQueryMarker: string
  start: () => Promise<T>
}

/** Replaces a client's redirect URIs; `start`'s operation must decide against the new URIs. */
export function replaceTestOAuthRedirectUrisWhileWaiting<T>(
  input: OperationWaitingOnClient<T> & { redirectUris: string[] },
): Promise<T> {
  return updateTestOAuthClientWhileWaiting(input, transaction =>
    transaction(
      `/* replaceTestOAuthRedirectUrisWhileWaiting */ UPDATE oauth_clients
       SET redirect_uris = $2::text[]
       WHERE client_id = $1`,
      [input.clientId, input.redirectUris],
    ),
  )
}

/** Replaces a client's secret hash; `start`'s operation must authenticate against the new hash. */
export function rotateTestOAuthClientSecretWhileWaiting<T>(
  input: OperationWaitingOnClient<T> & { clientSecretHash: string },
): Promise<T> {
  return updateTestOAuthClientWhileWaiting(input, transaction =>
    transaction(
      `/* rotateTestOAuthClientSecretWhileWaiting */ UPDATE oauth_clients
       SET client_secret_hash = $2
       WHERE client_id = $1`,
      [input.clientId, input.clientSecretHash],
    ),
  )
}

/**
 * Applies `update` in a transaction that commits only once the operation started by `start` is
 * blocked on the client row, so that operation cannot act on the row as it was before the update.
 */
async function updateTestOAuthClientWhileWaiting<T>(
  input: OperationWaitingOnClient<T>,
  update: (transaction: TransactionQuery) => Promise<unknown>,
): Promise<T> {
  let operation: Promise<T>
  {
    await using transaction = await beginTransaction()
    await update(transaction)
    const holderProcessId = await getTestPostgresBackendProcessId(transaction)
    operation = input.start()
    await waitForTestPostgresLockWaiter(holderProcessId, input.waiterQueryMarker)
    await transaction.commit()
  }
  return operation
}
