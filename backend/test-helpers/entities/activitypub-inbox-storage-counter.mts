import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type ActivityPubInboxStorageCounterSnapshot = {
  retainedRows: number
  retainedRawBodyBytes: number
  unverifiedRows: number
  unverifiedRawBodyBytes: number
}

export type ActivityPubInboxOwnedStorageCounterMeasurement = {
  before: ActivityPubInboxStorageCounterSnapshot
  afterOwnedWrite: ActivityPubInboxStorageCounterSnapshot
  afterScenario: ActivityPubInboxStorageCounterSnapshot
}

type StorageCounterScenario = 'insert-delete' | 'verify' | 'rollback'
type StorageTransaction = Awaited<ReturnType<typeof beginTransaction>>

export async function measureActivityPubInboxOwnedStorageCounterForTest(
  scenario: StorageCounterScenario,
  rawBodies: readonly Buffer[],
  remoteActorId?: string,
): Promise<ActivityPubInboxOwnedStorageCounterMeasurement> {
  if (rawBodies.length === 0) {
    throw new Error('ActivityPub inbox storage counter measurement requires an owned body')
  }
  const verificationActorId = remoteActorId
  if (scenario === 'verify' && (rawBodies.length !== 1 || verificationActorId === undefined)) {
    throw new Error(
      'ActivityPub inbox verification counter measurement requires one body and a remote actor',
    )
  }

  await using transaction = await beginTransaction()
  const before = await readStorageCounter(transaction)
  if (scenario === 'rollback') {
    await transaction(sql`/* measureActivityPubInboxOwnedStorageCounterForTest */
      SAVEPOINT activitypub_owned_storage_counter
    `)
  }
  const deliveryIds: string[] = []
  for (const rawBody of rawBodies)
    deliveryIds.push(await insertUnverifiedDelivery(transaction, rawBody))
  const afterOwnedWrite = await readStorageCounter(transaction)
  if (scenario === 'verify') {
    const deliveryId = deliveryIds[0]
    if (deliveryId === undefined || verificationActorId === undefined) {
      throw new Error(
        'ActivityPub inbox verification counter measurement requires one body and a remote actor',
      )
    }
    await transaction(sql`/* measureActivityPubInboxOwnedStorageCounterForTest */
      UPDATE activitypub_inbox_deliveries
      SET verified_at = CURRENT_TIMESTAMP,
          remote_actor_id = ${verificationActorId}
      WHERE id = ${deliveryId}
    `)
  } else if (scenario === 'insert-delete') {
    await transaction(sql`/* measureActivityPubInboxOwnedStorageCounterForTest */
      DELETE FROM activitypub_inbox_deliveries WHERE id = ANY(${deliveryIds})
    `)
  } else {
    await transaction(sql`/* measureActivityPubInboxOwnedStorageCounterForTest */
      ROLLBACK TO SAVEPOINT activitypub_owned_storage_counter
    `)
  }
  return { before, afterOwnedWrite, afterScenario: await readStorageCounter(transaction) }
}

async function readStorageCounter(
  transaction: StorageTransaction,
): Promise<ActivityPubInboxStorageCounterSnapshot> {
  const { rows } = await transaction<{
    retained_rows: string | number
    retained_raw_body_bytes: string | number
    unverified_rows: string | number
    unverified_raw_body_bytes: string | number
  }>(sql`/* measureActivityPubInboxOwnedStorageCounterForTest */
    SELECT retained_rows, retained_raw_body_bytes, unverified_rows, unverified_raw_body_bytes
    FROM activitypub_inbox_delivery_storage_counters
    WHERE singleton
    FOR UPDATE
  `)
  const row = rows[0]
  if (!row) throw new Error('ActivityPub inbox storage counter singleton is missing')
  return {
    retainedRows: Number(row.retained_rows),
    retainedRawBodyBytes: Number(row.retained_raw_body_bytes),
    unverifiedRows: Number(row.unverified_rows),
    unverifiedRawBodyBytes: Number(row.unverified_raw_body_bytes),
  }
}

async function insertUnverifiedDelivery(
  transaction: StorageTransaction,
  rawBody: Buffer,
): Promise<string> {
  const suffix = randomUUID()
  const actor = `https://${suffix}.example/users/alice`
  const { rows } = await transaction<{ id: string }>(
    sql`/* measureActivityPubInboxOwnedStorageCounterForTest */
      INSERT INTO activitypub_inbox_deliveries (
        request_method, request_target, expected_host, signature_header, digest_header,
        date_header, raw_body, claimed_activity_id, claimed_activity_type,
        claimed_actor_uri, sender_hostname
      ) VALUES (
        'POST', ${`/ap/inbox?delivery=${suffix}`}, 'voucha.example', 'signature', 'digest',
        ${new Date().toUTCString()}, ${rawBody}, ${`${actor}/activities/${suffix}`},
        'Create', ${actor}, ${`${suffix}.example`}
      )
      RETURNING id
    `,
  )
  const deliveryId = rows[0]?.id
  if (!deliveryId) {
    throw new Error('ActivityPub inbox storage counter measurement did not insert a delivery')
  }
  return deliveryId
}
