import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function deleteTestBlueskyLinkCompletion(flowId: string): Promise<void> {
  await write(sql`/* deleteTestBlueskyLinkCompletion */
    DELETE FROM bluesky_link_completions WHERE authorization_id = ${flowId}`)
}

export async function expireTestBlueskyLinkAuthorization(flowId: string): Promise<void> {
  await write(sql`/* expireTestBlueskyLinkAuthorization */
    UPDATE bluesky_link_authorizations
    SET expires_at = ${new Date(Date.now() - 1_000)}
    WHERE id = ${flowId}`)
}

export async function deleteTestBlueskyLinkedAccount(did: string): Promise<void> {
  await write(sql`/* deleteTestBlueskyLinkedAccount */
    DELETE FROM bluesky_linked_accounts WHERE bluesky_did = ${did}`)
}

export async function setTestBlueskyLinkAuthorizationStatus(
  flowId: string,
  status: 'callback_claimed' | 'handoff_ready',
): Promise<void> {
  await write(sql`/* setTestBlueskyLinkAuthorizationStatus */
    UPDATE bluesky_link_authorizations SET status = ${status} WHERE id = ${flowId}`)
}
