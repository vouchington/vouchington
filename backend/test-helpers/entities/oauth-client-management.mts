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
