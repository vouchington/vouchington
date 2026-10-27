import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type ActivityPubInboxVerificationConstraintName =
  | 'activitypub_inbox_envelopes__sender_requires_verification'
  | 'activitypub_inbox_envelopes__terminal_diagnostics_present'
  | 'activitypub_inbox_envelopes__verified_actor_paired'
  | 'activitypub_inbox_envelopes_remote_actor_id_fkey'

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
    WHERE c.conrelid = 'activitypub_inbox_envelopes'::regclass
      AND c.conname IN (
        'activitypub_inbox_envelopes__sender_requires_verification',
        'activitypub_inbox_envelopes__terminal_diagnostics_present',
        'activitypub_inbox_envelopes__verified_actor_paired',
        'activitypub_inbox_envelopes_remote_actor_id_fkey'
      )
  `)

  return rows.map(row => ({
    constraintName: row.constraint_name,
    definition: row.definition,
    deleteAction: row.delete_action,
  }))
}

export async function ageActivityPubInboxDeliveryReceivedAtForTest(
  deliveryId: string,
): Promise<void> {
  await write(sql`/* ageActivityPubInboxDeliveryReceivedAtForTest */
    UPDATE activitypub_inbox_envelopes
    SET received_at = NOW() - INTERVAL '31 minutes'
    WHERE id = ${deliveryId}
  `)
}

/** Move one owned envelope onto another id. Callers use this to age a UUIDv7 timestamp. */
export async function reassignActivityPubInboxDeliveryIdForTest(
  deliveryId: string,
  nextId: string,
): Promise<void> {
  await write(sql`/* reassignActivityPubInboxDeliveryIdForTest */
    UPDATE activitypub_inbox_envelopes
    SET id = ${nextId}::uuid
    WHERE id = ${deliveryId}::uuid
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
      FROM activitypub_inbox_envelopes
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
): Promise<{ deliveryId: string; requestDigest: string } | undefined> {
  const { rows } = await write<{
    id: string
    request_digest: string
  }>(sql`/* getActivityPubInboxDeliveryIdentityForTest */
    SELECT id, request_digest
    FROM activitypub_inbox_envelopes
    WHERE claimed_activity_id = ${claimedActivityId}
  `)
  const row = rows[0]
  return row ? { deliveryId: row.id, requestDigest: row.request_digest } : undefined
}

export async function softDeleteRemoteActorForInboxTest(remoteActorId: string): Promise<void> {
  await write(sql`/* softDeleteRemoteActorForInboxTest */
    UPDATE remote_actors
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = ${remoteActorId}
  `)
}
