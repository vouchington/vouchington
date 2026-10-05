import type { FiniteValue } from '@data-stores/psql/finite-values/index'
import type { ActivityPubInboxDelivery } from './durable-delivery-transition-contract.mts'
import type { RecoverableActivityPubInboxDelivery } from './durable-delivery-capacity-contract.mts'

export type DeliveryIdentityRow = { id: string; lease_token: string }

export type DeliveryRow = DeliveryIdentityRow & {
  request_method: FiniteValue<'http_request_methods'>
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

export function mapIdentity(row: DeliveryIdentityRow): RecoverableActivityPubInboxDelivery {
  return { deliveryId: row.id, leaseToken: row.lease_token }
}

export function mapDelivery(row: DeliveryRow): ActivityPubInboxDelivery {
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
    leaseToken: row.lease_token,
    remoteActorId: row.remote_actor_id,
    receivedAt: row.received_at,
    verifiedAt: row.verified_at,
    senderAllowedAt: row.sender_allowed_at,
  }
}
