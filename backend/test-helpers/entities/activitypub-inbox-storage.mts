import { read, beginTransaction, write } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'

export async function cleanupActivityPubInboxStorageFixturesForTest(
  claimedActivityIds: readonly string[],
): Promise<void> {
  if (claimedActivityIds.length === 0) return
  await write(sql`/* cleanupActivityPubInboxStorageFixturesForTest */
    DELETE FROM ap_inbox_deliveries
    WHERE claimed_activity_id = ANY(${claimedActivityIds})
  `)
}

export async function deleteActivityPubInboxDeliveriesForTest(
  deliveryIds: readonly string[],
): Promise<void> {
  await write(sql`/* deleteActivityPubInboxDeliveriesForTest */
    DELETE FROM ap_inbox_deliveries WHERE id = ANY(${deliveryIds})
  `)
}

export async function getActivityPubInboxStorageTriggerDefinitionsForTest(): Promise<{
  insertDefinition: string
  updateDefinition: string
}> {
  const { rows } = await read<{ insert_definition: string; update_definition: string }>(
    sql`/* getActivityPubInboxStorageTriggerDefinitionsForTest */
      SELECT pg_get_functiondef('fn_ap_inbox_delivery_storage_after_insert()'::regprocedure) AS insert_definition,
             pg_get_functiondef('fn_ap_inbox_delivery_storage_after_update()'::regprocedure) AS update_definition
    `,
  )
  return {
    insertDefinition: rows[0]?.insert_definition ?? '',
    updateDefinition: rows[0]?.update_definition ?? '',
  }
}

export async function expireActivityPubInboxDeliveryForTest(deliveryId: string): Promise<void> {
  await write(sql`/* expireActivityPubInboxDeliveryForTest */
    UPDATE ap_inbox_deliveries
    SET retention_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute',
        received_at = CURRENT_TIMESTAMP - INTERVAL '2 hours',
        enqueued_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes'
    WHERE id = ${deliveryId}
  `)
}

export async function makeActivityPubInboxFailureExpiredForTest(deliveryId: string): Promise<void> {
  await write(sql`/* makeActivityPubInboxFailureExpiredForTest */
    UPDATE ap_inbox_deliveries
    SET processing_at = CURRENT_TIMESTAMP - INTERVAL '31 minutes',
        failed_at = CURRENT_TIMESTAMP - INTERVAL '8 days',
        last_error = 'expired'
    WHERE id = ${deliveryId}
  `)
}

export async function ageActivityPubInboxCleanupFixturesForTest(
  activeDeliveryId: string,
  staleDeliveryId: string,
  idleDeliveryId: string,
): Promise<void> {
  await write(sql`/* ageActivityPubInboxCleanupFixturesForTest */
    UPDATE ap_inbox_deliveries
    SET received_at = CURRENT_TIMESTAMP - INTERVAL '2 hours',
        retention_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 hour',
        processing_at = CASE
          WHEN id = ${activeDeliveryId} THEN CURRENT_TIMESTAMP
          WHEN id = ${staleDeliveryId} THEN CURRENT_TIMESTAMP - INTERVAL '31 minutes'
          ELSE NULL
        END
    WHERE id IN (${activeDeliveryId}, ${staleDeliveryId}, ${idleDeliveryId})
  `)
}

export async function getExistingActivityPubInboxDeliveryIdsForTest(
  deliveryIds: readonly string[],
): Promise<string[]> {
  const { rows } = await read<{
    id: string
  }>(sql`/* getExistingActivityPubInboxDeliveryIdsForTest */
    SELECT id FROM ap_inbox_deliveries WHERE id = ANY(${deliveryIds}) ORDER BY id
  `)
  return rows.map(row => row.id)
}

export async function insertActivityPubInboxDeliveryThenRollbackForTest(envelope: {
  requestMethod: string
  requestTarget: string
  expectedHost: string
  signatureHeader: string
  digestHeader: string
  dateHeader: string
  rawBody: Buffer
  claimedActivityId: string
  claimedActivityType: string
  claimedActorUri: string
  senderHostname: string
}): Promise<never> {
  {
    await using transaction = await beginTransaction()
    await transaction(sql`/* insertActivityPubInboxDeliveryThenRollbackForTest */
        INSERT INTO ap_inbox_deliveries (
          request_method, request_target, expected_host, signature_header, digest_header,
          date_header, raw_body, claimed_activity_id, claimed_activity_type,
          claimed_actor_uri, sender_hostname
        ) VALUES (
          ${envelope.requestMethod}, ${envelope.requestTarget}, ${envelope.expectedHost},
          ${envelope.signatureHeader}, ${envelope.digestHeader}, ${envelope.dateHeader},
          ${envelope.rawBody}, ${envelope.claimedActivityId}, ${envelope.claimedActivityType},
          ${envelope.claimedActorUri}, ${envelope.senderHostname}
        )
      `)
    throw new Error('rollback')
  }
}

export async function getActivityPubInboxRetentionStateForTest(deliveryId: string) {
  const { rows } = await read<{
    received_at: Date
    first_failed_at: Date | null
    retention_expires_at: Date | null
  }>(sql`/* getActivityPubInboxRetentionStateForTest */
    SELECT received_at, first_failed_at, retention_expires_at
    FROM ap_inbox_deliveries
    WHERE id = ${deliveryId}
  `)
  const row = rows[0]
  if (!row) throw new Error(`Missing ActivityPub inbox delivery ${deliveryId}`)
  return row
}

export async function insertActivityPubInboxCapacityDeliveriesForTest(
  count: number,
  bodyBytes: number,
  expired = false,
): Promise<void> {
  await write(sql`/* insertActivityPubInboxCapacityDeliveriesForTest */
    INSERT INTO ap_inbox_deliveries (
      request_method, request_target, expected_host, signature_header, digest_header, date_header,
      raw_body, claimed_activity_id, claimed_activity_type, claimed_actor_uri, sender_hostname,
      received_at, retention_expires_at
    )
    SELECT 'POST', '/ap/inbox', 'voucha.example', 'signature', 'digest', 'date',
           DECODE(REPEAT('00', ${bodyBytes}), 'hex'),
           'https://capacity.example/activities/' || value,
           'Create', 'https://capacity.example/users/alice', 'capacity.example',
           CASE WHEN ${expired} THEN CURRENT_TIMESTAMP - INTERVAL '2 hours' ELSE CURRENT_TIMESTAMP END,
           CASE WHEN ${expired} THEN CURRENT_TIMESTAMP - INTERVAL '1 hour' ELSE CURRENT_TIMESTAMP + INTERVAL '1 hour' END
    FROM generate_series(1, ${count}) AS value
  `)
}

export async function explainActivityPubInboxCleanupForTest(query: SQLStatement): Promise<string> {
  {
    await using transaction = await beginTransaction()
    await transaction(sql`SET LOCAL enable_seqscan = off`)
    const { rows } = await transaction<{ 'QUERY PLAN': unknown }>(
      `EXPLAIN (FORMAT JSON) ${query.text}`,
      query.values,
    )
    const result = JSON.stringify(rows)
    await transaction.commit()
    return result
  }
}
