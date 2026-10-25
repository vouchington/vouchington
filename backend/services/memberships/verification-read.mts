import { read, type QueryExecutor } from '@data-stores/psql'
import { createCodedError } from '@vouchington/sentry'
import { NOT_FOUND } from '@modules/on-error/error-codes'
import sql from 'sql-template-strings'
import type { MembershipPurchaseProvider } from './purchase-intent-launches.mts'
import {
  getMembershipVerificationStatus,
  type MembershipVerification,
  type MembershipVerificationReasonCode,
  type VerificationLifecycle,
} from './verification-contract.mts'

type VerificationRow = VerificationLifecycle & {
  id: string
  user_id: string
  provider: MembershipPurchaseProvider
  environment: 'test' | 'production'
  application_id: string
  request_fingerprint: string
  result_code: MembershipVerificationReasonCode | null
  created_at: Date
}

export async function getMembershipVerification(
  userId: string,
  verificationId: string,
): Promise<MembershipVerification> {
  const { rows } = await read<VerificationRow>(sql`/* getMembershipVerification */
    SELECT verification.id, verification.user_id, context.provider, context.environment,
      context.application_id, verification.request_fingerprint,
      verification.verified_at, verification.conflicted_at, verification.rejected_at,
      verification.result_code, verification.created_at
    FROM membership_verifications verification
    INNER JOIN membership_provider_contexts context ON context.id = verification.membership_provider_context_id
    WHERE verification.id = ${verificationId} AND verification.user_id = ${userId}
    LIMIT 1`)
  const row = rows[0]
  if (!row) throw createCodedError(404, 'Membership verification not found.', NOT_FOUND)
  return toVerification(row)
}

export async function loadVerification(
  query: QueryExecutor,
  userId: string,
  idempotencyKey: string,
) {
  const { rows } = await query<VerificationRow>(sql`/* createMembershipVerification.load */
    SELECT verification.id, verification.user_id, context.provider, context.environment,
      context.application_id, verification.request_fingerprint,
      verification.verified_at, verification.conflicted_at, verification.rejected_at,
      verification.result_code, verification.created_at
    FROM membership_verifications verification
    INNER JOIN membership_provider_contexts context ON context.id = verification.membership_provider_context_id
    WHERE verification.user_id = ${userId} AND verification.idempotency_key = ${idempotencyKey}
    LIMIT 1`)
  return rows[0] ?? null
}

export function toVerification(row: VerificationRow): MembershipVerification {
  return {
    id: row.id,
    provider: row.provider,
    status: getMembershipVerificationStatus(row),
    reason_code: row.result_code,
    created_at: row.created_at,
  }
}
