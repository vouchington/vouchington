import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function deleteTestBlueskyLinkFixtures(options: {
  authorizationIds: string[]
}): Promise<void> {
  if (options.authorizationIds.length === 0) return
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(sql`/* deleteTestBlueskyLinkFixtures:completions */
        DELETE FROM bluesky_link_completions
        WHERE authorization_id = ANY(${options.authorizationIds}::uuid[])`)
    await query(sql`/* deleteTestBlueskyLinkFixtures:accounts */
        DELETE FROM bluesky_linked_accounts
        WHERE link_authorization_id = ANY(${options.authorizationIds}::uuid[])`)
    await query(sql`/* deleteTestBlueskyLinkFixtures:authorizations */
        DELETE FROM bluesky_link_authorizations
        WHERE id = ANY(${options.authorizationIds}::uuid[])`)
    await transaction.commit()
  }
}
