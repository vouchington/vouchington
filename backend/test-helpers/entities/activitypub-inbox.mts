import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type ActivityPubInboxVerificationConstraintName =
  | 'ap_inbox_deliveries__deferral_state_valid'
  | 'ap_inbox_deliveries__failure_state_valid'
  | 'ap_inbox_deliveries__sender_admission_requires_verification'
  | 'ap_inbox_deliveries__terminal_diagnostics_present'
  | 'ap_inbox_deliveries__verified_actor_paired'
  | 'ap_inbox_deliveries_remote_actor_id_fkey'

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
    WHERE c.conrelid = 'ap_inbox_deliveries'::regclass
      AND c.conname IN (
        'ap_inbox_deliveries__deferral_state_valid',
        'ap_inbox_deliveries__failure_state_valid',
        'ap_inbox_deliveries__sender_admission_requires_verification',
        'ap_inbox_deliveries__terminal_diagnostics_present',
        'ap_inbox_deliveries__verified_actor_paired',
        'ap_inbox_deliveries_remote_actor_id_fkey'
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
    UPDATE ap_inbox_deliveries
    SET enqueued_at = NOW() - INTERVAL '31 minutes',
        received_at = NOW() - INTERVAL '31 minutes',
        processing_at = CASE
          WHEN ${mode} = 'stale' THEN NOW() - INTERVAL '31 minutes'
          ELSE NULL
        END
    WHERE id = ${deliveryId}
  `)
}

export async function ageActivityPubInboxDeliveryReceivedAtForTest(
  deliveryId: string,
): Promise<void> {
  await write(sql`/* ageActivityPubInboxDeliveryReceivedAtForTest */
    UPDATE ap_inbox_deliveries
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
      FROM ap_inbox_deliveries
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
    UPDATE ap_inbox_delivery_storage_counters
    SET retained_rows = ${unverifiedRows},
        retained_raw_body_bytes = ${unverifiedRawBodyBytes},
        unverified_rows = ${unverifiedRows},
        unverified_raw_body_bytes = ${unverifiedRawBodyBytes}
    WHERE singleton
  `)
}

export async function resetActivityPubInboxDeliveryStorageForTest(
  options: { removeCounterSingleton?: boolean } = {},
): Promise<void> {
  await write(sql`/* ensureActivityPubInboxStorageCounterForTest */
    INSERT INTO ap_inbox_delivery_storage_counters (
      singleton, retained_rows, retained_raw_body_bytes, unverified_rows, unverified_raw_body_bytes
    )
    SELECT TRUE,
           COUNT(*),
           COALESCE(SUM(OCTET_LENGTH(raw_body)), 0),
           COUNT(*) FILTER (WHERE verified_at IS NULL),
           COALESCE(SUM(OCTET_LENGTH(raw_body)) FILTER (WHERE verified_at IS NULL), 0)
    FROM ap_inbox_deliveries
    ON CONFLICT (singleton) DO NOTHING
  `)
  await write(sql`/* resetActivityPubInboxDeliveryStorageForTest */
    DELETE FROM ap_inbox_deliveries
  `)
  if (options.removeCounterSingleton) {
    await write(sql`/* removeActivityPubInboxStorageCounterForTest */
      DELETE FROM ap_inbox_delivery_storage_counters WHERE singleton
    `)
    return
  }
  await write(sql`/* restoreActivityPubInboxStorageCounterForTest */
    INSERT INTO ap_inbox_delivery_storage_counters (
      singleton, retained_rows, retained_raw_body_bytes, unverified_rows, unverified_raw_body_bytes
    ) VALUES (TRUE, 0, 0, 0, 0)
    ON CONFLICT (singleton) DO UPDATE
    SET retained_rows = 0,
        retained_raw_body_bytes = 0,
        unverified_rows = 0,
        unverified_raw_body_bytes = 0
  `)
}
