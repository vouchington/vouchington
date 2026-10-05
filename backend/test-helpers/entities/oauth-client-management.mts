import { beginTransaction, read, write, type TransactionQuery } from '@data-stores/psql'
import {
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from '../postgres-lock-wait.mts'

/** Returns the internal row id that management routes address a client by. */
export async function getTestOAuthClientRowId(clientId: string): Promise<string> {
  const { rows } = await read<{ id: string }>(
    `/* getTestOAuthClientRowId */ SELECT id FROM oauth_clients WHERE client_id = $1`,
    [clientId],
  )
  const row = rows[0]
  if (!row) throw new Error(`OAuth client ${clientId} does not exist`)
  return row.id
}

/** Returns the public OAuth client id that responses carry for a client's internal row id. */
export async function getTestOAuthClientPublicId(id: string): Promise<string> {
  const { rows } = await read<{ client_id: string }>(
    `/* getTestOAuthClientPublicId */ SELECT client_id FROM oauth_clients WHERE id = $1`,
    [id],
  )
  const row = rows[0]
  if (!row) throw new Error(`OAuth client row ${id} does not exist`)
  return row.client_id
}

/** Records staff verification directly, for tests that only need a verified client. */
export async function setTestOAuthClientVerified(id: string, verifiedById: string): Promise<void> {
  await write(
    `/* setTestOAuthClientVerified */ UPDATE oauth_clients
     SET verified_at = CURRENT_TIMESTAMP, verified_by_id = $2
     WHERE id = $1`,
    [id, verifiedById],
  )
}

/** Withdraws staff verification directly, as a staff action would. */
export async function clearTestOAuthClientVerified(id: string): Promise<void> {
  await write(
    `/* clearTestOAuthClientVerified */ UPDATE oauth_clients
     SET verified_at = NULL, verified_by_id = NULL
     WHERE id = $1`,
    [id],
  )
}

/** Renames a client directly, as a registration update would. */
export async function renameTestOAuthClient(id: string, clientName: string): Promise<void> {
  await write(
    `/* renameTestOAuthClient */ UPDATE oauth_clients SET client_name = $2 WHERE id = $1`,
    [id, clientName],
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
  let operationOutcome: Promise<[PromiseSettledResult<T>]>
  {
    await using transaction = await beginTransaction()
    await update(transaction)
    const holderProcessId = await getTestPostgresBackendProcessId(transaction)
    operationOutcome = Promise.allSettled([input.start()] as const)
    await waitForTestPostgresLockWaiter(holderProcessId, input.waiterQueryMarker)
    await transaction.commit()
  }
  const [outcome] = await operationOutcome
  if (outcome.status === 'rejected') throw outcome.reason
  return outcome.value
}

export async function revokeTestOAuthClient(id: string): Promise<void> {
  await write(
    `/* revokeTestOAuthClient */ UPDATE oauth_clients
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [id],
  )
}

/** Holds an OAuth client row lock while an OAuth operation has already acquired participant locks. */
export async function startPausedTestOAuthClientUpdate(
  clientId: string,
): Promise<{ completed: Promise<void>; holderProcessId: number; release(): void }> {
  const release = Promise.withResolvers<void>()
  const locked = Promise.withResolvers<number>()
  const completed = (async () => {
    await using transaction = await beginTransaction()
    await transaction(
      `/* startPausedTestOAuthClientUpdate */ UPDATE oauth_clients
       SET client_name = client_name WHERE client_id = $1`,
      [clientId],
    )
    locked.resolve(await getTestPostgresBackendProcessId(transaction))
    await release.promise
    await transaction.commit()
  })()
  void completed.catch(locked.reject)
  return {
    completed,
    holderProcessId: await locked.promise,
    release: () => release.resolve(),
  }
}

/** Marks a client as described by a client metadata document rather than registered via DCR. */
export async function setTestOAuthClientMetadataUrl(
  id: string,
  metadataUrl: string,
): Promise<void> {
  await write(
    `/* setTestOAuthClientMetadataUrl */ UPDATE oauth_clients
     SET client_id = $2,
         metadata_url = $2,
         metadata_refresh_generation = nextval('oauth_client_metadata_refresh_generation_seq'),
         metadata_refreshed_at = CURRENT_TIMESTAMP,
         metadata_expires_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes',
         owner_user_id = NULL,
         client_type = 'public',
         token_endpoint_auth_method = 'none',
         client_secret_hash = NULL,
         verified_at = NULL,
         verified_by_id = NULL
     WHERE id = $1`,
    [id, metadataUrl],
  )
}
