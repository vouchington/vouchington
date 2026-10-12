import { write } from './fixture-executor.mts'
import sql from './fixture-sql.mts'

export async function deleteTestWebPushEndpointOwner(
  userId: string,
  subscriptionId: string,
): Promise<void> {
  await write(sql`/* deleteTestWebPushEndpointOwner */
    DELETE FROM web_push_endpoint_owners
    WHERE user_id = ${userId} AND subscription_id = ${subscriptionId}::uuid`)
}

export async function softDeleteTestWebPushSubscription(
  userId: string,
  subscriptionId: string,
): Promise<void> {
  await write(sql`/* softDeleteTestWebPushSubscription */
    UPDATE web_push_subscriptions
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE user_id = ${userId} AND id = ${subscriptionId}::uuid`)
}
