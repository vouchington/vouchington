import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ActivityPubInboxTransitionResult } from './durable-delivery-transition-contract.mts'

export async function verifyActivityPubInboxDelivery(
  deliveryId: string,
  remoteActorId: string,
): Promise<ActivityPubInboxTransitionResult> {
  const result = await write(sql`/* verifyActivityPubInboxDelivery */
    UPDATE activitypub_inbox_envelopes
    SET verified_at = CURRENT_TIMESTAMP,
        remote_actor_id = ${remoteActorId},
        retention_expires_at = CASE WHEN first_failed_at IS NULL THEN NULL ELSE retention_expires_at END
    WHERE id = ${deliveryId}
      AND verified_at IS NULL
      AND remote_actor_id IS NULL
      AND failed_at IS NULL
  `)
  return mutationResult(result.rowCount)
}

export async function admitActivityPubInboxDeliverySender(
  deliveryId: string,
): Promise<ActivityPubInboxTransitionResult> {
  const result = await write(sql`/* admitActivityPubInboxDeliverySender */
    UPDATE activitypub_inbox_envelopes
    SET sender_allowed_at = CURRENT_TIMESTAMP
    WHERE id = ${deliveryId}
      AND verified_at IS NOT NULL
      AND remote_actor_id IS NOT NULL
      AND sender_allowed_at IS NULL
      AND failed_at IS NULL
  `)
  return mutationResult(result.rowCount)
}

function mutationResult(rowCount: number | null): ActivityPubInboxTransitionResult {
  return (rowCount ?? 0) > 0 ? { outcome: 'applied', value: undefined } : { outcome: 'stale' }
}
