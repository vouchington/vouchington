import {
  mapIdentity,
  mapDelivery,
  type DeliveryIdentityRow,
  type DeliveryRow,
} from './durable-delivery-intake-mapping.mts'
import { getApInboxActivitiesWorkLimit } from './work-limits.mts'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  ActivityPubInboxDelivery,
  ActivityPubInboxEnvelope,
  ActivityPubInboxTransitionResult,
} from './durable-delivery-transition-contract.mts'
import type { ActivityPubInboxAcceptResult } from './durable-delivery-capacity-contract.mts'
import { ACTIVITYPUB_INBOX_STORAGE_POLICY } from '@modules/activitypub-inbox-storage-policy'

const UNVERIFIED_CAPACITY_CONSTRAINT = 'activitypub_inbox_delivery_work_items_unverified_capacity'

export async function acceptActivityPubInboxDelivery(
  envelope: ActivityPubInboxEnvelope,
  verifiedRemoteActorId?: string,
): Promise<ActivityPubInboxAcceptResult> {
  const verifiedAt = verifiedRemoteActorId ? new Date() : null
  try {
    const { rows } = await write(sql`/* acceptActivityPubInboxDelivery */
      INSERT INTO activitypub_inbox_delivery_work_items (
        request_method, request_target, expected_host, signature_header, digest_header, date_header,
        content_type_header, raw_body, claimed_activity_id, claimed_activity_type,
        claimed_actor_uri, sender_hostname, remote_actor_id, verified_at, sender_allowed_at
      ) VALUES (
        ${envelope.requestMethod}, ${envelope.requestTarget}, ${envelope.expectedHost},
        ${envelope.signatureHeader}, ${envelope.digestHeader}, ${envelope.dateHeader},
        ${envelope.contentTypeHeader ?? null}, ${envelope.rawBody}, ${envelope.claimedActivityId},
        ${envelope.claimedActivityType}, ${envelope.claimedActorUri}, ${envelope.senderHostname},
        ${verifiedRemoteActorId ?? null}, ${verifiedAt}, ${verifiedAt}
      )
      RETURNING id, lease_token
    `)
    const row = rows[0] as DeliveryIdentityRow
    return { outcome: 'applied', value: mapIdentity(row) }
  } catch (err) {
    return mapActivityPubInboxCapacityErrorOrThrow(err)
  }
}

export function mapActivityPubInboxCapacityErrorOrThrow(
  error: unknown,
): ActivityPubInboxAcceptResult {
  const capacity = parseCapacityExceeded(error)
  if (capacity) return { outcome: 'capacity-exceeded', value: capacity }
  throw error
}

export async function acknowledgeActivityPubInboxDeliveryEnqueue(
  deliveryId: string,
  leaseToken: string,
): Promise<ActivityPubInboxTransitionResult> {
  const result = await write(sql`/* acknowledgeActivityPubInboxDeliveryEnqueue */
    UPDATE activitypub_inbox_delivery_work_items
    SET dispatched_at = CURRENT_TIMESTAMP
    WHERE id = ${deliveryId}
      AND lease_token = ${leaseToken}
      AND failed_at IS NULL
      AND available_at <= CURRENT_TIMESTAMP
  `)
  return mutationResult(result.rowCount)
}

export async function claimActivityPubInboxDelivery(
  deliveryId: string,
  leaseToken: string,
): Promise<ActivityPubInboxTransitionResult<ActivityPubInboxDelivery>> {
  const duration = getApInboxActivitiesWorkLimit('processing_timeout_minutes')
  const { rows } = await write(sql`/* claimActivityPubInboxDelivery */
    UPDATE activitypub_inbox_delivery_work_items
    SET leased_at = clock_timestamp(),
        lease_expires_at = clock_timestamp() + ${duration}::integer * INTERVAL '1 minute',
        attempt_count = attempt_count + 1,
        last_error = NULL
    WHERE id = ${deliveryId}
      AND lease_token = ${leaseToken}
      AND leased_at IS NULL
      AND failed_at IS NULL
      AND (retention_expires_at IS NULL OR retention_expires_at > CURRENT_TIMESTAMP)
      AND available_at <= CURRENT_TIMESTAMP
    RETURNING id, request_method, request_target, expected_host, signature_header, digest_header,
              date_header, content_type_header, raw_body, claimed_activity_id,
              claimed_activity_type, claimed_actor_uri, sender_hostname, lease_token,
              remote_actor_id, received_at, verified_at, sender_allowed_at
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

function mutationResult(rowCount: number | null): ActivityPubInboxTransitionResult {
  return (rowCount ?? 0) > 0 ? { outcome: 'applied', value: undefined } : { outcome: 'stale' }
}
