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

export async function softDeleteRemoteActorForInboxTest(remoteActorId: string): Promise<void> {
  await write(sql`/* softDeleteRemoteActorForInboxTest */
    UPDATE remote_actors
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = ${remoteActorId}
  `)
}

export async function setActivityPubInboxStorageCountersForTest(
  unverifiedRows: number,
  unverifiedRawBodyBytes: number,
): Promise<void> {
  await write(sql`/* setActivityPubInboxStorageCountersForTest */
    UPDATE activitypub_inbox_delivery_storage_counters
    SET retained_rows = ${unverifiedRows},
        retained_raw_body_bytes = ${unverifiedRawBodyBytes},
        unverified_rows = ${unverifiedRows},
        unverified_raw_body_bytes = ${unverifiedRawBodyBytes}
    WHERE is_singleton
  `)
}

export async function resetActivityPubInboxDeliveryStorageForTest(
  options: { removeCounterSingleton?: boolean } = {},
): Promise<void> {
  await write(sql`/* ensureActivityPubInboxStorageCounterForTest */
    INSERT INTO activitypub_inbox_delivery_storage_counters (
      is_singleton, retained_rows, retained_raw_body_bytes, unverified_rows, unverified_raw_body_bytes
    )
    SELECT TRUE,
           COUNT(*),
           COALESCE(SUM(OCTET_LENGTH(raw_body)), 0),
           COUNT(*) FILTER (WHERE verified_at IS NULL),
           COALESCE(SUM(OCTET_LENGTH(raw_body)) FILTER (WHERE verified_at IS NULL), 0)
    FROM activitypub_inbox_delivery_work_items
    ON CONFLICT (is_singleton) DO NOTHING
  `)
  await write(sql`/* resetActivityPubInboxDeliveryStorageForTest */
    DELETE FROM activitypub_inbox_delivery_work_items
  `)
  if (options.removeCounterSingleton) {
    await write(sql`/* removeActivityPubInboxStorageCounterForTest */
      DELETE FROM activitypub_inbox_delivery_storage_counters WHERE is_singleton
    `)
    return
  }
  await write(sql`/* restoreActivityPubInboxStorageCounterForTest */
    INSERT INTO activitypub_inbox_delivery_storage_counters (
      is_singleton, retained_rows, retained_raw_body_bytes, unverified_rows, unverified_raw_body_bytes
    ) VALUES (TRUE, 0, 0, 0, 0)
    ON CONFLICT (is_singleton) DO UPDATE
    SET retained_rows = 0,
        retained_raw_body_bytes = 0,
        unverified_rows = 0,
        unverified_raw_body_bytes = 0
  `)
}
