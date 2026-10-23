import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type ActivityPubInboxVerificationConstraintName =
  | 'activitypub_inbox_work_items__deferral_state_valid'
  | 'activitypub_inbox_work_items__failure_state_valid'
  | 'activitypub_inbox_work_items__sender_requires_verification'
  | 'activitypub_inbox_work_items__terminal_diagnostics_present'
  | 'activitypub_inbox_work_items__verified_actor_paired'
  | 'activitypub_inbox_delivery_work_items_remote_actor_id_fkey'

type ActivityPubInboxVerificationConstraintForTest = {
  constraintName: ActivityPubInboxVerificationConstraintName
  definition: string
  deleteAction: 'RESTRICT' | 'NO ACTION' | null
}

export async function getActivityPubInboxVerificationConstraintsForTest(): Promise<
  ActivityPubInboxVerificationConstraintForTest[]
> {
  const { rows } = await read<{
    constraint_name: ActivityPubInboxVerificationConstraintName
    definition: string
    delete_action: ActivityPubInboxVerificationConstraintForTest['deleteAction']
  }>(sql`/* getActivityPubInboxVerificationConstraintsForTest */
    SELECT c.conname AS constraint_name,
           pg_get_constraintdef(c.oid) AS definition,
           CASE c.confdeltype WHEN 'r' THEN 'RESTRICT' WHEN 'a' THEN 'NO ACTION' ELSE NULL END AS delete_action
    FROM pg_constraint c
    WHERE c.conrelid = 'activitypub_inbox_delivery_work_items'::regclass
      AND c.conname IN (
        'activitypub_inbox_work_items__deferral_state_valid',
        'activitypub_inbox_work_items__failure_state_valid',
        'activitypub_inbox_work_items__sender_requires_verification',
        'activitypub_inbox_work_items__terminal_diagnostics_present',
        'activitypub_inbox_work_items__verified_actor_paired',
        'activitypub_inbox_delivery_work_items_remote_actor_id_fkey'
      )
  `)

  return rows.map(row => ({
    constraintName: row.constraint_name,
    definition: row.definition,
    deleteAction: row.delete_action,
  }))
}

export async function makeActivityPubInboxDeliveryRecoverableForTest(
  deliveryId: string,
  mode: 'unstarted' | 'stale',
): Promise<void> {
  await write(sql`/* makeActivityPubInboxDeliveryRecoverableForTest */
    UPDATE activitypub_inbox_delivery_work_items
    SET dispatched_at = NOW() - INTERVAL '31 minutes',
        received_at = NOW() - INTERVAL '31 minutes',
        leased_at = CASE
          WHEN ${mode} = 'stale' THEN NOW() - INTERVAL '31 minutes'
          ELSE NULL
        END,
        lease_expires_at = CASE WHEN ${mode} = 'stale' THEN NOW() - INTERVAL '1 minute' ELSE NULL END
    WHERE id = ${deliveryId}
  `)
}

export async function ageActivityPubInboxDeliveryReceivedAtForTest(
  deliveryId: string,
): Promise<void> {
  await write(sql`/* ageActivityPubInboxDeliveryReceivedAtForTest */
    UPDATE activitypub_inbox_delivery_work_items
    SET received_at = NOW() - INTERVAL '31 minutes'
    WHERE id = ${deliveryId}
  `)
}

export async function activityPubInboxDeliveryExistsOnPrimaryForTest(
  claimedActivityId: string,
): Promise<boolean> {
  const { rows } = await write<{
    exists: boolean
  }>(sql`/* activityPubInboxDeliveryExistsOnPrimaryForTest */
    SELECT EXISTS (
      SELECT 1
      FROM activitypub_inbox_delivery_work_items
      WHERE claimed_activity_id = ${claimedActivityId}
    ) AS exists
  `)
  return rows[0]?.exists ?? false
}

export async function getActivityPubInboxDeliveryIdForTest(
  claimedActivityId: string,
): Promise<string | undefined> {
  return (await getActivityPubInboxDeliveryIdentityForTest(claimedActivityId))?.deliveryId
}

export async function getActivityPubInboxDeliveryIdentityForTest(
  claimedActivityId: string,
): Promise<{ deliveryId: string; leaseToken: string } | undefined> {
  const { rows } = await write<{
    id: string
    lease_token: string
  }>(sql`/* getActivityPubInboxDeliveryIdentityForTest */
    SELECT id, lease_token
    FROM activitypub_inbox_delivery_work_items
    WHERE claimed_activity_id = ${claimedActivityId}
  `)
  const row = rows[0]
  return row ? { deliveryId: row.id, leaseToken: row.lease_token } : undefined
}

export async function softDeleteRemoteActorForInboxTest(remoteActorId: string): Promise<void> {
  await write(sql`/* softDeleteRemoteActorForInboxTest */
    UPDATE remote_actors
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = ${remoteActorId}
  `)
}
