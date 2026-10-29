import { write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decodeAdministratorRetainedResponse } from './administrator-retained-response.mts'

export type RetainedAdministratorRefundRequest = {
  id: string
  membershipId: string
  issuerSha256: Buffer
  requestFingerprint: string
  refundId: string
  cancellationStatus: 'not_requested' | 'completed'
}

type RetainedAdministratorRefundRequestRow = Omit<
  RetainedAdministratorRefundRequest,
  'refundId' | 'cancellationStatus'
> & { responseSnapshot: unknown }

function decodeRetainedRequest(row: RetainedAdministratorRefundRequestRow | undefined) {
  if (!row) return null
  const { responseSnapshot, ...identity } = row
  return { ...identity, ...decodeAdministratorRetainedResponse(responseSnapshot) }
}

export async function getRetainedAdministratorRefundRequestByKey(
  idempotencyKey: string,
  scope: { provider: string; providerApplicationId: string; providerEnvironment: string },
  query: QueryExecutor = write,
): Promise<RetainedAdministratorRefundRequest | null> {
  const { rows } = await query<RetainedAdministratorRefundRequestRow>(sql`
    /* getRetainedAdministratorRefundRequestByKey */
    SELECT retained.id, retained.administrator_membership_id AS "membershipId",
      retained.administrator_issuer_sha256 AS "issuerSha256",
      retained.administrator_request_fingerprint AS "requestFingerprint",
      retained.administrator_response_snapshot AS "responseSnapshot"
    FROM membership_operation_retained_identities retained
    JOIN membership_provider_contexts context
      ON context.id = retained.membership_provider_context_id
    WHERE retained.idempotency_key = ${idempotencyKey}
      AND retained.operation_kind = 'administrator_refund'
      AND context.provider = ${scope.provider}
      AND context.environment = ${scope.providerEnvironment}
      AND context.application_id = ${scope.providerApplicationId}`)
  return decodeRetainedRequest(rows[0])
}

export async function getRetainedAdministratorRefundRequestForMembershipKey(
  idempotencyKey: string,
  membershipId: string,
  query: QueryExecutor,
): Promise<RetainedAdministratorRefundRequest | null> {
  const { rows } = await query<RetainedAdministratorRefundRequestRow>(sql`
    /* getRetainedAdministratorRefundRequestForMembershipKey */
    SELECT retained.id, retained.administrator_membership_id AS "membershipId",
      retained.administrator_issuer_sha256 AS "issuerSha256",
      retained.administrator_request_fingerprint AS "requestFingerprint",
      retained.administrator_response_snapshot AS "responseSnapshot"
    FROM membership_operation_retained_identities retained
    JOIN memberships membership ON membership.id = retained.administrator_membership_id
    WHERE retained.idempotency_key = ${idempotencyKey}
      AND retained.operation_kind = 'administrator_refund'
      AND membership.id = ${membershipId}`)
  return decodeRetainedRequest(rows[0])
}
