import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { computeActivityPubInboxRequestDigest } from '../../services/ap-inbox-activities/durable-delivery-transition-intake.mts'

export async function insertExpiredVerifiedActivityPubInboxDeliveriesForTest(
  count: number,
  remoteActorId: string,
): Promise<string[]> {
  const owner = randomUUID()
  const rawBody = Buffer.from([0])
  const digests = Array.from({ length: count }, (_, index) =>
    computeActivityPubInboxRequestDigest({
      requestMethod: 'POST',
      requestTarget: `/ap/inbox?fixture=${owner}-${index + 1}`,
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
  }>(sql`/* insertExpiredVerifiedActivityPubInboxDeliveriesForTest */
    INSERT INTO activitypub_inbox_envelopes (
      request_method, request_target, expected_host, signature_header, digest_header, date_header,
      raw_body, claimed_activity_id, claimed_activity_type, claimed_actor_uri, sender_hostname,
      remote_actor_id, verified_at, failed_at,
      first_failed_at, retention_expires_at, last_error, request_digest
    )
    SELECT 'POST', '/ap/inbox?fixture=' || ${owner} || '-' || value, 'voucha.example', 'signature', 'digest', 'date',
           DECODE('00', 'hex'),
           'https://' || ${owner} || '.example/activities/' || value,
           'Create', 'https://' || ${owner} || '.example/users/alice',
           ${`${owner}.example`}, ${remoteActorId},
           CURRENT_TIMESTAMP - INTERVAL '9 days',
           CURRENT_TIMESTAMP - INTERVAL '8 days',
           CURRENT_TIMESTAMP - INTERVAL '8 days',
           CURRENT_TIMESTAMP - INTERVAL '2 days',
           'expired', (${digests}::text[])[value]
    FROM generate_series(1, ${count}) AS value
    RETURNING id
  `)
  return rows.map(row => row.id)
}
