import { createHash } from 'node:crypto'
import { beginTransaction, type QueryExecutor, read } from '@data-stores/psql'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { IDEMPOTENCY_KEY_REUSED, INVALID_INPUT, NOT_FOUND } from '@modules/on-error/error-codes'
import { encryptSecret } from '@modules/token-secrets'
import { enqueueProcessMembershipVerification } from '@queues/memberships/enqueues'
import { getMembershipProviderContext } from '@voucha/config/membership-providers'
import sql from 'sql-template-strings'
import type { MembershipPurchaseProvider } from './purchase-intent-launches.mts'
import {
  canonicalizeMembershipEvidence,
  createMembershipVerificationFingerprint,
  getMembershipVerificationStatus,
  type MembershipVerification,
  type MembershipVerificationReasonCode,
  type VerificationLifecycle,
} from './verification-contract.mts'
export * from './verification-contract.mts'
export * from './verification-recovery.mts'

const MAX_EVIDENCE_PLAINTEXT_BYTES = 32_768

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

export type CreateMembershipVerificationOptions = {
  userId: string
  provider: MembershipPurchaseProvider
  purchaseIntentId: string | null
  idempotencyKey: string
  evidence: unknown
  trustedProviderContext?: { environment: 'test' | 'production'; applicationId: string }
}

export async function createMembershipVerification(
  options: CreateMembershipVerificationOptions,
): Promise<MembershipVerification & { replayed: boolean }> {
  await using query = await beginTransaction()
  const verification = await createMembershipVerificationInTransaction(options, query)
  await query.commit()
  if (verification.status === 'pending')
    await enqueueProcessMembershipVerification({ verificationId: verification.id })
  return verification
}

/** Creates the durable verification inside a caller-owned transaction without enqueueing it. */
export async function createMembershipVerificationInTransaction(
  options: CreateMembershipVerificationOptions,
  query: QueryExecutor,
): Promise<MembershipVerification & { replayed: boolean }> {
  const canonicalEvidence = canonicalizeMembershipEvidence(options.evidence)
  const serializedEvidence = JSON.stringify(
    (options.provider === 'google_play' || options.provider === 'microsoft_store') &&
      canonicalEvidence &&
      typeof canonicalEvidence === 'object' &&
      !Array.isArray(canonicalEvidence)
      ? { ...canonicalEvidence, _verification_idempotency_key: options.idempotencyKey }
      : canonicalEvidence,
  )
  if (Buffer.byteLength(serializedEvidence) > MAX_EVIDENCE_PLAINTEXT_BYTES)
    throw createCodedError(413, 'Membership evidence is too large.', INVALID_INPUT)
  const requestFingerprint = createMembershipVerificationFingerprint(
    options.provider,
    options.purchaseIntentId,
    options.evidence,
  )
  const context = options.purchaseIntentId
    ? await getPurchaseIntentContext(query, {
        userId: options.userId,
        provider: options.provider,
        purchaseIntentId: options.purchaseIntentId,
      })
    : toDatabaseProviderContext(
        options.trustedProviderContext ?? getMembershipProviderContext(options.provider),
      )
  const evidenceLookupSha256 = createHash('sha256').update(serializedEvidence).digest('hex')
  const encryptedEvidence = Buffer.from(
    encryptSecret(
      serializedEvidence,
      `membership-provider-evidence:${options.provider}:${evidenceLookupSha256}`,
    ),
  )
  const insertedEvidence = await query<{
    id: string
  }>(sql`/* createMembershipVerification.evidence */
    INSERT INTO membership_provider_evidence_records (
      provider, environment, application_id, evidence_lookup_sha256, encrypted_evidence
    ) VALUES (
      ${options.provider}, ${context.environment}, ${context.application_id},
      ${evidenceLookupSha256}, ${encryptedEvidence}
    )
    ON CONFLICT (provider, environment, application_id, evidence_lookup_sha256) DO NOTHING
    RETURNING id`)
  const evidenceId =
    insertedEvidence.rows[0]?.id ??
    (
      await query<{ id: string }>(sql`/* createMembershipVerification.existingEvidence */
        SELECT id FROM membership_provider_evidence_records
        WHERE provider = ${options.provider}
          AND environment = ${context.environment}
          AND application_id = ${context.application_id}
          AND evidence_lookup_sha256 = ${evidenceLookupSha256}
        LIMIT 1`)
    ).rows[0]?.id
  if (!evidenceId) throw new Error('Membership evidence record was not returned')
  const inserted = await query<{ id: string }>(sql`/* createMembershipVerification.insert */
    INSERT INTO membership_verifications (
      user_id, idempotency_key, request_fingerprint, membership_purchase_intent_id,
      membership_provider_evidence_id, provider, environment, application_id
    ) VALUES (
      ${options.userId}, ${options.idempotencyKey}, ${requestFingerprint},
      ${options.purchaseIntentId}, ${evidenceId}, ${options.provider},
      ${context.environment}, ${context.application_id}
    )
    ON CONFLICT (user_id, idempotency_key) DO NOTHING
    RETURNING id`)
  const row = await loadVerification(query, options.userId, options.idempotencyKey)
  if (!row) throw new Error('Membership verification was not returned')
  if (row.request_fingerprint !== requestFingerprint)
    throw createCodedError(
      409,
      'This idempotency key was already used for different evidence.',
      IDEMPOTENCY_KEY_REUSED,
    )
  return { ...toVerification(row), replayed: inserted.rowCount !== 1 }
}

function toDatabaseProviderContext(context: {
  environment: 'test' | 'production'
  applicationId: string
}) {
  return { environment: context.environment, application_id: context.applicationId }
}

async function getPurchaseIntentContext(
  query: QueryExecutor,
  options: {
    userId: string
    provider: MembershipPurchaseProvider
    purchaseIntentId: string
  },
): Promise<{ environment: 'test' | 'production'; application_id: string }> {
  const { rows } = await query<{
    environment: 'test' | 'production'
    application_id: string
  }>(sql`/* createMembershipVerification.context */
    SELECT environment, application_id FROM membership_purchase_intents
    WHERE id = ${options.purchaseIntentId} AND user_id = ${options.userId}
      AND provider = ${options.provider}
    LIMIT 1`)
  const context = rows[0]
  if (!context) throw createCodedError(422, 'Invalid membership purchase intent.', INVALID_INPUT)
  return context
}

export async function getMembershipVerification(
  userId: string,
  verificationId: string,
): Promise<MembershipVerification> {
  const { rows } = await read<VerificationRow>(sql`/* getMembershipVerification */
    SELECT id, user_id, provider, environment, application_id, request_fingerprint,
      verified_at, conflicted_at, rejected_at, result_code, created_at
    FROM membership_verifications
    WHERE id = ${verificationId} AND user_id = ${userId}
    LIMIT 1`)
  const row = rows[0]
  if (!row) throw createCodedError(404, 'Membership verification not found.', NOT_FOUND)
  return toVerification(row)
}

async function loadVerification(query: QueryExecutor, userId: string, idempotencyKey: string) {
  const { rows } = await query<VerificationRow>(sql`/* createMembershipVerification.load */
    SELECT id, user_id, provider, environment, application_id, request_fingerprint,
      verified_at, conflicted_at, rejected_at, result_code, created_at
    FROM membership_verifications
    WHERE user_id = ${userId} AND idempotency_key = ${idempotencyKey}
    LIMIT 1`)
  return rows[0] ?? null
}

function toVerification(row: VerificationRow): MembershipVerification {
  return {
    id: row.id,
    provider: row.provider,
    status: getMembershipVerificationStatus(row),
    reason_code: row.result_code,
    created_at: row.created_at,
  }
}
