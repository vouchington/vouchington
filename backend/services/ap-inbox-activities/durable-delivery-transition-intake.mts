import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  ActivityPubInboxDelivery,
  ActivityPubInboxEnvelope,
  ActivityPubInboxTransitionResult,
} from './durable-delivery-transition-contract.mts'
import type {
  ActivityPubInboxAcceptResult,
  RecoverableActivityPubInboxDelivery,
} from './durable-delivery-capacity-contract.mts'
import { ACTIVITYPUB_INBOX_STORAGE_POLICY } from '@modules/activitypub-inbox-storage-policy'

const UNVERIFIED_CAPACITY_CONSTRAINT = 'ap_inbox_deliveries_unverified_capacity'

export async function acceptActivityPubInboxDelivery(
  envelope: ActivityPubInboxEnvelope,
  verifiedRemoteActorId?: string,
): Promise<ActivityPubInboxAcceptResult> {
  const verifiedAt = verifiedRemoteActorId ? new Date() : null
  try {
    const { rows } = await write(sql`/* acceptActivityPubInboxDelivery */
      INSERT INTO ap_inbox_deliveries (
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
      RETURNING id, processing_attempt_id
    `)
    const row = rows[0] as DeliveryIdentityRow
    return { outcome: 'applied', value: mapIdentity(row) }
  } catch (error) {
    return mapActivityPubInboxCapacityErrorOrThrow(error)
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
  processingAttemptId: string,
): Promise<ActivityPubInboxTransitionResult> {
  const result = await write(sql`/* acknowledgeActivityPubInboxDeliveryEnqueue */
    UPDATE ap_inbox_deliveries
    SET enqueued_at = CURRENT_TIMESTAMP
    WHERE id = ${deliveryId}
      AND processing_attempt_id = ${processingAttemptId}
      AND failed_at IS NULL
      AND deferred_until IS NULL
  `)
  return mutationResult(result.rowCount)
}

export async function claimActivityPubInboxDelivery(
  deliveryId: string,
  processingAttemptId: string,
): Promise<ActivityPubInboxTransitionResult<ActivityPubInboxDelivery>> {
  const { rows } = await write(sql`/* claimActivityPubInboxDelivery */
    UPDATE ap_inbox_deliveries
    SET processing_at = CURRENT_TIMESTAMP,
        deferred_until = NULL,
        last_error = NULL
    WHERE id = ${deliveryId}
      AND processing_attempt_id = ${processingAttemptId}
      AND processing_at IS NULL
      AND failed_at IS NULL
      AND (retention_expires_at IS NULL OR retention_expires_at > CURRENT_TIMESTAMP)
      AND (deferred_until IS NULL OR deferred_until <= CURRENT_TIMESTAMP)
    RETURNING id, request_method, request_target, expected_host, signature_header, digest_header,
              date_header, content_type_header, raw_body, claimed_activity_id,
              claimed_activity_type, claimed_actor_uri, sender_hostname, processing_attempt_id,
              remote_actor_id, received_at, verified_at, sender_allowed_at
  `)
  const row = rows[0] as DeliveryRow | undefined
  return row ? { outcome: 'applied', value: mapDelivery(row) } : { outcome: 'stale' }
}

function parseCapacityExceeded(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const pgError = error as { code?: string; constraint?: string; detail?: string }
  if (pgError.code !== '23514' || pgError.constraint !== UNVERIFIED_CAPACITY_CONSTRAINT) return null
  let detail: unknown
  try {
    detail = JSON.parse(pgError.detail ?? '')
  } catch {
    throw error
  }
  if (!isCapacityDetail(detail)) throw error
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

type DeliveryIdentityRow = { id: string; processing_attempt_id: string }

type DeliveryRow = DeliveryIdentityRow & {
  request_method: string
  request_target: string
  expected_host: string
  signature_header: string
  digest_header: string
  date_header: string
  content_type_header: string | null
  raw_body: Buffer
  claimed_activity_id: string
  claimed_activity_type: string
  claimed_actor_uri: string
  sender_hostname: string
  remote_actor_id: string | null
  received_at: Date
  verified_at: Date | null
  sender_allowed_at: Date | null
}

function mapIdentity(row: DeliveryIdentityRow): RecoverableActivityPubInboxDelivery {
  return { deliveryId: row.id, processingAttemptId: row.processing_attempt_id }
}

function mapDelivery(row: DeliveryRow): ActivityPubInboxDelivery {
  return {
    id: row.id,
    requestMethod: row.request_method,
    requestTarget: row.request_target,
    expectedHost: row.expected_host,
    signatureHeader: row.signature_header,
    digestHeader: row.digest_header,
    dateHeader: row.date_header,
    contentTypeHeader: row.content_type_header ?? undefined,
    rawBody: row.raw_body,
    claimedActivityId: row.claimed_activity_id,
    claimedActivityType: row.claimed_activity_type,
    claimedActorUri: row.claimed_actor_uri,
    senderHostname: row.sender_hostname,
    processingAttemptId: row.processing_attempt_id,
    remoteActorId: row.remote_actor_id,
    receivedAt: row.received_at,
    verifiedAt: row.verified_at,
    senderAllowedAt: row.sender_allowed_at,
  }
}

function mutationResult(rowCount: number | null): ActivityPubInboxTransitionResult {
  return (rowCount ?? 0) > 0 ? { outcome: 'applied', value: undefined } : { outcome: 'stale' }
}
