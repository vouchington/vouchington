import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function requestTestBlueskyDisconnect(did: string): Promise<void> {
  await write(sql`/* requestTestBlueskyDisconnect */
    UPDATE bluesky_linked_accounts
    SET disconnect_requested_at = CURRENT_TIMESTAMP
    WHERE bluesky_did = ${did}`)
}
