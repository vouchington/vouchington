import { randomUUID } from 'node:crypto'
import { onTestFinished } from 'vitest'
import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { read, beginTransaction, write } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import { computeActivityPubInboxRequestDigest } from '../../services/ap-inbox-activities/durable-delivery-transition-intake.mts'

export async function cleanupActivityPubInboxStorageFixturesForTest(
  claimedActivityIds: readonly string[],
): Promise<void> {
  if (claimedActivityIds.length === 0) return
  await write(sql`/* cleanupActivityPubInboxStorageFixturesForTest */
    DELETE FROM activitypub_inbox_envelopes
    WHERE claimed_activity_id = ANY(${claimedActivityIds})
  `)
}

export async function deleteActivityPubInboxDeliveriesForTest(
  deliveryIds: readonly string[],
): Promise<void> {
  await write(sql`/* deleteActivityPubInboxDeliveriesForTest */
    DELETE FROM activitypub_inbox_envelopes WHERE id = ANY(${deliveryIds})
  `)
}

export async function getActivityPubInboxStorageTriggerDefinitionsForTest(): Promise<{
  insertDefinition: string
  updateDefinition: string
}> {
  const { rows } = await read<{ insert_definition: string; update_definition: string }>(
    sql`/* getActivityPubInboxStorageTriggerDefinitionsForTest */
      SELECT pg_get_functiondef('fn_project_activitypub_inbox_delivery_storage_after_insert()'::regprocedure) AS insert_definition,
             pg_get_functiondef('fn_project_activitypub_inbox_delivery_storage_after_update()'::regprocedure) AS update_definition
    `,
  )
  return {
    insertDefinition: rows[0]?.insert_definition ?? '',
    updateDefinition: rows[0]?.update_definition ?? '',
  }
}

export async function expireActivityPubInboxDeliveryForTest(deliveryId: string): Promise<void> {
  await write(sql`/* expireActivityPubInboxDeliveryForTest */
    UPDATE activitypub_inbox_envelopes
    SET retention_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute',
        received_at = CURRENT_TIMESTAMP - INTERVAL '2 hours'
    WHERE id = ${deliveryId}
  `)
}

export async function makeActivityPubInboxFailureExpiredForTest(deliveryId: string): Promise<void> {
  await write(sql`/* makeActivityPubInboxFailureExpiredForTest */
    UPDATE activitypub_inbox_envelopes
    SET failed_at = CURRENT_TIMESTAMP - INTERVAL '8 days',
        first_failed_at = CURRENT_TIMESTAMP - INTERVAL '8 days',
        retention_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 day',
        last_error = 'expired'
    WHERE id = ${deliveryId}
  `)
}

export async function ageActivityPubInboxCleanupFixturesForTest(
  ...deliveryIds: string[]
): Promise<void> {
  await write(sql`/* ageActivityPubInboxCleanupFixturesForTest */
    UPDATE activitypub_inbox_envelopes
    SET received_at = CURRENT_TIMESTAMP - INTERVAL '2 hours',
        retention_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 hour'
    WHERE id = ANY(${deliveryIds}::uuid[])
  `)
}

export async function getExistingActivityPubInboxDeliveryIdsForTest(
  deliveryIds: readonly string[],
): Promise<string[]> {
  const { rows } = await read<{
    id: string
  }>(sql`/* getExistingActivityPubInboxDeliveryIdsForTest */
    SELECT id FROM activitypub_inbox_envelopes WHERE id = ANY(${deliveryIds}) ORDER BY id
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
    const requestDigest = computeActivityPubInboxRequestDigest(envelope)
    await using transaction = await beginTransaction()
    await transaction(sql`/* insertActivityPubInboxDeliveryThenRollbackForTest */
        INSERT INTO activitypub_inbox_envelopes (
          request_method, request_target, expected_host, signature_header, digest_header,
          date_header, raw_body, claimed_activity_id, claimed_activity_type,
          claimed_actor_uri, sender_hostname, request_digest
        ) VALUES (
          ${envelope.requestMethod}, ${envelope.requestTarget}, ${envelope.expectedHost},
          ${envelope.signatureHeader}, ${envelope.digestHeader}, ${envelope.dateHeader},
          ${envelope.rawBody}, ${envelope.claimedActivityId}, ${envelope.claimedActivityType},
          ${envelope.claimedActorUri}, ${envelope.senderHostname}, ${requestDigest}
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
    FROM activitypub_inbox_envelopes
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
): Promise<string[]> {
  if (!Number.isInteger(count) || count < 0 || !Number.isInteger(bodyBytes) || bodyBytes < 0)
    throw new Error('ActivityPub capacity fixtures require nonnegative integer sizes')
  if (count === 0) return []
  const suffix = randomUUID()
  const rawBody = Buffer.alloc(bodyBytes, 'x')
  const digests = Array.from({ length: count }, (_, index) =>
    computeActivityPubInboxRequestDigest({
      requestMethod: 'POST',
      requestTarget: `/ap/inbox?fixture=${suffix}-${index + 1}`,
      expectedHost: 'voucha.example',
      signatureHeader: 'signature',
      digestHeader: 'digest',
      dateHeader: 'date',
      contentTypeHeader: undefined,
      rawBody,
    }),
  )
  const { rows } = await write<{
    id: string
  }>(sql`/* insertActivityPubInboxCapacityDeliveriesForTest */
    INSERT INTO activitypub_inbox_envelopes (
      request_method, request_target, expected_host, signature_header, digest_header, date_header,
      raw_body, claimed_activity_id, claimed_activity_type, claimed_actor_uri, sender_hostname,
      received_at, retention_expires_at, request_digest
    )
    SELECT 'POST', '/ap/inbox?fixture=' || ${suffix} || '-' || value, 'voucha.example', 'signature', 'digest', 'date',
           CONVERT_TO(REPEAT('x', ${bodyBytes}), 'UTF8'),
           'https://' || ${suffix} || '.example/activities/' || value,
           'Create', 'https://' || ${suffix} || '.example/users/alice', ${`${suffix}.example`},
           CASE WHEN ${expired} THEN CURRENT_TIMESTAMP - INTERVAL '2 hours' ELSE CURRENT_TIMESTAMP END,
           CASE WHEN ${expired} THEN CURRENT_TIMESTAMP - INTERVAL '1 hour' ELSE CURRENT_TIMESTAMP + INTERVAL '1 hour' END,
           (${digests}::text[])[value]
    FROM generate_series(1, ${count}) AS value
    RETURNING id
  `)
  const ids = rows.map(row => row.id)
  onTestFinished(() => deleteActivityPubInboxDeliveriesForTest(ids))
  return ids
}

export async function explainActivityPubInboxCleanupForTest(query: SQLStatement): Promise<string> {
  {
    await using transaction = await beginTransaction()
    await transaction(allowUnannotatedQuery(sql`SET LOCAL enable_seqscan = off`))
    const { rows } = await transaction<{ 'QUERY PLAN': unknown }>(
      `/* explainActivityPubInboxCleanupForTest */ EXPLAIN (FORMAT JSON) ${query.text}`,
      query.values,
    )
    const result = JSON.stringify(rows)
    await transaction.commit()
    return result
  }
}
