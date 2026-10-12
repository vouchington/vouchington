import { randomBytes, randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  MembershipProvider,
  MembershipProviderSourceKind,
} from '../../../services/memberships/create-types.mts'
import type { MembershipStatus } from '@voucha/types/entities/membership'

export async function createTestUnprojectedProviderObservation(options: {
  applicationId: string
  effectiveAt?: Date
  environment?: 'test' | 'production'
  expiresAt?: Date | null
  membershipProductId: string
  membershipProviderProductId: string
  provider: MembershipProvider
  providerAccountId?: string | null
  providerLineageId?: string
  providerOrder?: number
  providerRevision?: string
  sourceKind: MembershipProviderSourceKind
  status?: MembershipStatus
  terminalAt?: Date
  userId: string
}): Promise<{
  membershipProviderObservationId: string
  sourceIdentity: {
    applicationId: string
    environment: 'test' | 'production'
    provider: MembershipProvider
    providerAccountId: string | null
    providerLineageId: string
  }
}> {
  const effectiveAt = options.effectiveAt ?? new Date()
  const terminalAt = options.terminalAt ?? effectiveAt
  const status = options.status ?? 'active'
  const environment = options.environment ?? 'test'
  const providerLineageId = options.providerLineageId ?? `lineage-${randomUUID()}`
  const providerAccountId =
    options.providerAccountId === undefined ? null : options.providerAccountId
  const expiresAt =
    options.expiresAt !== undefined
      ? options.expiresAt
      : status === 'expired'
        ? terminalAt
        : new Date(effectiveAt.getTime() + 30 * 86_400_000)
  const lifecycle = getLifecycle(status, terminalAt)
  await using query = await beginTransaction()
  const { rows: contextRows } = await query<{
    id: string
  }>(sql`/* createTestUnprojectedProviderObservation: context */
    SELECT fn_upsert_membership_provider_context_id(${options.provider}, ${environment}, ${options.applicationId}) AS id`)
  const contextId = contextRows[0]!.id
  const { rows: insertedLineageRows } =
    await query(sql`/* createTestUnprojectedProviderObservation: lineage */
    INSERT INTO membership_provider_lineages (
      membership_provider_context_id, provider_lineage_id, provider_account_id
    ) VALUES (
      ${contextId}, ${providerLineageId},
      ${providerAccountId}
    ) ON CONFLICT (membership_provider_context_id, provider_lineage_id)
    DO NOTHING
    RETURNING id`)
  let lineage = insertedLineageRows[0] as { id: string } | undefined
  if (!lineage) {
    const { rows } =
      await query(sql`/* createTestUnprojectedProviderObservation: existing lineage */
      SELECT id FROM membership_provider_lineages
      WHERE membership_provider_context_id = ${contextId} AND provider_lineage_id = ${providerLineageId}
      FOR KEY SHARE`)
    lineage = rows[0] as { id: string }
  }
  const { rows: evidenceRows } =
    await query(sql`/* createTestUnprojectedProviderObservation: evidence */
    INSERT INTO membership_provider_evidence_records (
      membership_provider_context_id, membership_provider_lineage_id,
      evidence_lookup_sha256, encrypted_evidence, verified_at
    ) VALUES (
      ${contextId}, ${lineage.id},
      ${randomBytes(32).toString('hex')}, ${randomBytes(32)}, CURRENT_TIMESTAMP
    ) RETURNING id`)
  const evidence = evidenceRows[0] as { id: string }
  const { rows: observationRows } =
    await query(sql`/* createTestUnprojectedProviderObservation: observation */
    INSERT INTO membership_provider_observations (
      membership_provider_context_id, membership_provider_evidence_record_id,
      membership_provider_lineage_id, membership_provider_product_id, membership_product_id,
      observed_price_minor_units, observed_price_currency_code, provider_revision, provider_order,
      source_kind, effective_at, expires_at, cancelled_at, expired_at, past_due_at, paused_at, should_auto_renew
    ) SELECT
      ${contextId}, ${evidence.id}, ${lineage.id},
      provider_product.id, provider_product.membership_product_id, provider_product.price_minor_units,
      provider_product.currency_code, ${options.providerRevision ?? `revision-${randomUUID()}`},
      ${options.providerOrder ?? 0}, ${options.sourceKind},
      ${effectiveAt}, ${expiresAt}, ${lifecycle.cancelledAt}, ${lifecycle.expiredAt},
      ${lifecycle.pastDueAt}, ${lifecycle.pausedAt}, false
    FROM membership_provider_products provider_product
    WHERE provider_product.id = ${options.membershipProviderProductId}
      AND provider_product.membership_product_id = ${options.membershipProductId}
      AND provider_product.membership_provider_context_id = ${contextId}
    RETURNING id`)
  const observation = observationRows[0] as { id: string } | undefined
  if (!observation) throw new Error('Test provider product context was not found')
  await query.commit()
  return {
    membershipProviderObservationId: observation.id,
    sourceIdentity: {
      provider: options.provider,
      environment,
      applicationId: options.applicationId,
      providerLineageId,
      providerAccountId,
    },
  }
}

function getLifecycle(status: MembershipStatus, terminalAt: Date) {
  return {
    cancelledAt: status === 'cancelled' ? terminalAt : null,
    expiredAt: status === 'expired' ? terminalAt : null,
    pastDueAt: status === 'past_due' ? terminalAt : null,
    pausedAt: status === 'paused' ? terminalAt : null,
  }
}
