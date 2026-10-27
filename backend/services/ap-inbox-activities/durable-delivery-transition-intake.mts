import { createHash } from 'node:crypto'
import {
  mapIdentity,
  mapDelivery,
  type DeliveryIdentityRow,
  type DeliveryRow,
} from './durable-delivery-intake-mapping.mts'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  ActivityPubInboxDelivery,
  ActivityPubInboxEnvelope,
  ActivityPubInboxTransitionResult,
} from './durable-delivery-transition-contract.mts'
import type { ActivityPubInboxAcceptResult } from './durable-delivery-capacity-contract.mts'
import { ACTIVITYPUB_INBOX_STORAGE_POLICY } from '@modules/activitypub-inbox-storage-policy'

const UNVERIFIED_CAPACITY_CONSTRAINT = 'activitypub_inbox_envelopes_unverified_capacity'

export async function acceptActivityPubInboxDelivery(
  envelope: ActivityPubInboxEnvelope,
  verifiedRemoteActorId?: string,
): Promise<ActivityPubInboxAcceptResult> {
  const verifiedAt = verifiedRemoteActorId ? new Date() : null
  // A JSON array preserves field boundaries and the exact request-body bytes.
  const requestDigest = computeActivityPubInboxRequestDigest(envelope)
  try {
    const { rows } = await write(sql`/* acceptActivityPubInboxDelivery */
      INSERT INTO activitypub_inbox_envelopes (
        request_digest, request_method, request_target, expected_host, signature_header, digest_header, date_header,
        content_type_header, raw_body, claimed_activity_id, claimed_activity_type,
        claimed_actor_uri, sender_hostname, remote_actor_id, verified_at, sender_allowed_at
      ) VALUES (
        ${requestDigest}, ${envelope.requestMethod}, ${envelope.requestTarget}, ${envelope.expectedHost},
        ${envelope.signatureHeader}, ${envelope.digestHeader}, ${envelope.dateHeader},
        ${envelope.contentTypeHeader ?? null}, ${envelope.rawBody}, ${envelope.claimedActivityId},
        ${envelope.claimedActivityType}, ${envelope.claimedActorUri}, ${envelope.senderHostname},
        ${verifiedRemoteActorId ?? null}, ${verifiedAt}, ${verifiedAt}
      )
      ON CONFLICT (request_digest) DO UPDATE
      SET request_digest = EXCLUDED.request_digest
      RETURNING WITH (OLD AS old, NEW AS new)
        new.id, new.request_digest, old.id IS NULL AS was_inserted
    `)
    const row = rows[0] as DeliveryIdentityRow & { was_inserted: boolean }
    return { outcome: 'applied', value: mapIdentity(row), wasInserted: row.was_inserted }
  } catch (err) {
    return mapActivityPubInboxCapacityErrorOrThrow(err)
  }
}

export function computeActivityPubInboxRequestDigest(
  envelope: Pick<
    ActivityPubInboxEnvelope,
    | 'requestMethod'
    | 'requestTarget'
    | 'expectedHost'
    | 'signatureHeader'
    | 'digestHeader'
    | 'dateHeader'
    | 'rawBody'
    | 'contentTypeHeader'
  >,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        envelope.requestMethod,
        envelope.requestTarget,
        envelope.expectedHost,
        envelope.signatureHeader,
        envelope.digestHeader,
        envelope.dateHeader,
        envelope.contentTypeHeader ?? null,
        envelope.rawBody.toString('base64'),
      ]),
    )
    .digest('hex')
}

export function mapActivityPubInboxCapacityErrorOrThrow(
  error: unknown,
): ActivityPubInboxAcceptResult {
  const capacity = parseCapacityExceeded(error)
  if (capacity) return { outcome: 'capacity-exceeded', value: capacity }
  throw error
}

export async function loadActivityPubInboxDelivery(
  deliveryId: string,
): Promise<ActivityPubInboxTransitionResult<ActivityPubInboxDelivery>> {
  const { rows } = await write(sql`/* loadActivityPubInboxDelivery */
    SELECT id, request_digest, request_method, request_target, expected_host, signature_header,
           digest_header, date_header, content_type_header, raw_body, claimed_activity_id,
           claimed_activity_type, claimed_actor_uri, sender_hostname, remote_actor_id,
           received_at, verified_at, sender_allowed_at
    FROM activitypub_inbox_envelopes
    WHERE id = ${deliveryId}
      AND failed_at IS NULL
      AND (retention_expires_at IS NULL OR retention_expires_at > CURRENT_TIMESTAMP)
  `)
  const row = rows[0] as DeliveryRow | undefined
  return row ? { outcome: 'applied', value: mapDelivery(row) } : { outcome: 'stale' }
}

function parseCapacityExceeded(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const pgError = error as { code?: string; constraint?: string; detail?: string }
  if (pgError.code !== '23514' || pgError.constraint !== UNVERIFIED_CAPACITY_CONSTRAINT) return null
  const originalError =
    error instanceof Error ? error : new Error('Invalid capacity detail', { cause: error })
  let detail: unknown
  try {
    detail = JSON.parse(pgError.detail ?? '')
  } catch {
    throw originalError
  }
  if (!isCapacityDetail(detail)) throw originalError
  const limitingDimensions: ('rows' | 'raw-body-bytes')[] = []
  if (
    detail.unverifiedRows + detail.attemptedRows >
    ACTIVITYPUB_INBOX_STORAGE_POLICY.maximumUnverifiedRows
  ) {
    limitingDimensions.push('rows')
  }
  if (
    detail.unverifiedRawBodyBytes + detail.attemptedRawBodyBytes >
    ACTIVITYPUB_INBOX_STORAGE_POLICY.maximumUnverifiedRawBodyBytes
  ) {
    limitingDimensions.push('raw-body-bytes')
  }
  return {
    snapshot: {
      unverifiedRows: detail.unverifiedRows,
      unverifiedRawBodyBytes: detail.unverifiedRawBodyBytes,
    },
    attemptedRows: detail.attemptedRows,
    attemptedRawBodyBytes: detail.attemptedRawBodyBytes,
    limitingDimensions,
  }
}

function isCapacityDetail(value: unknown): value is CapacityDetail {
  if (!value || typeof value !== 'object') return false
  const detail = value as Partial<Record<keyof CapacityDetail, unknown>>
  return (
    isNonNegativeSafeInteger(detail.unverifiedRows) &&
    isNonNegativeSafeInteger(detail.unverifiedRawBodyBytes) &&
    isNonNegativeSafeInteger(detail.attemptedRows) &&
    isNonNegativeSafeInteger(detail.attemptedRawBodyBytes)
  )
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

type CapacityDetail = {
  unverifiedRows: number
  unverifiedRawBodyBytes: number
  attemptedRows: number
  attemptedRawBodyBytes: number
}
