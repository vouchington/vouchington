import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { projectVerifiedProviderMembershipObservation } from '../provider-observation-projection.mts'
import { finalizeVerified, getContext } from './verification-persistence.mts'

type KnownSource = {
  userId: string
  lineageId: string
  membershipProductId: string
  membershipProviderProductId: string
  effectiveAt: Date
  expiresAt: Date | null
}

/** Only a bound current leaf can authoritatively close a known Google source. */
export async function getKnownGooglePlayCurrentSource(options: {
  environment: 'test' | 'production'
  applicationId: string
  purchaseTokenDigest: string
}): Promise<Pick<KnownSource, 'userId' | 'lineageId'> | null> {
  const known = await findKnownSource(write, { ...options, userId: null })
  return known ? { userId: known.userId, lineageId: known.lineageId } : null
}

export async function terminalizeKnownGooglePlaySource(options: {
  verificationId: string
  claimToken: string
  purchaseTokenDigest: string
  providerOrder: number
}): Promise<boolean> {
  await using query = await beginTransaction()
  const context = await getContext(options.verificationId, options.claimToken, query)
  if (!context || context.evidenceVerifiedAt || context.evidenceRejectedAt) return false
  const initialKnown = await findKnownSource(query, {
    environment: context.environment,
    applicationId: context.applicationId,
    purchaseTokenDigest: options.purchaseTokenDigest,
    userId: context.userId,
  })
  if (!initialKnown) return false
  const { rows: lockedLineage } = await query<{
    id: string
  }>(sql`/* lockGooglePlayPermanentLookupLineage */
    SELECT id FROM membership_provider_lineages WHERE id = ${initialKnown.lineageId} FOR UPDATE`)
  if (!lockedLineage[0]) throw new Error('Google Play canonical lineage was not returned')
  // A fetched successor can have been waiting to persist while this lookup failed. Recheck the
  // leaf after serializing with its alias write, rather than closing a stale predecessor.
  const known = await findKnownSource(query, {
    environment: context.environment,
    applicationId: context.applicationId,
    purchaseTokenDigest: options.purchaseTokenDigest,
    userId: context.userId,
  })
  if (!known) return false
  const { rowCount } = await query(sql`/* verifyGooglePlayPermanentLookupEvidence */
    UPDATE membership_provider_evidence_records
    SET membership_provider_lineage_id = ${known.lineageId}, verified_at = CURRENT_TIMESTAMP
    WHERE id = ${context.evidenceId} AND verified_at IS NULL AND rejected_at IS NULL
      AND (membership_provider_lineage_id IS NULL OR membership_provider_lineage_id = ${known.lineageId})`)
  if (rowCount !== 1) throw new Error('Google Play permanent-lookup evidence claim was superseded')
  const now = new Date()
  const expiresAt = new Date(
    Math.max(
      known.effectiveAt.getTime(),
      Math.min(known.expiresAt?.getTime() ?? now.getTime(), now.getTime()),
    ),
  )
  const { rows } = await query<{ id: string }>(sql`/* insertGooglePlayPermanentLookupObservation */
    INSERT INTO membership_provider_observations (
      provider, environment, application_id, membership_provider_evidence_id,
      membership_provider_lineage_id, membership_provider_product_id, membership_product_id,
      provider_revision, provider_order, terminal_at, source_kind, effective_at, expires_at,
      expired_at, auto_renews
    ) VALUES (
      'google_play', ${context.environment}, ${context.applicationId}, ${context.evidenceId},
      ${known.lineageId}, ${known.membershipProviderProductId}, ${known.membershipProductId},
      ${`lookup-missing:${options.purchaseTokenDigest}`}, ${options.providerOrder}, ${now}, 'direct',
      ${known.effectiveAt}, ${expiresAt}, ${now}, false
    ) RETURNING id`)
  const observationId = rows[0]?.id
  if (!observationId) throw new Error('Google Play permanent-lookup observation was not returned')
  await projectVerifiedProviderMembershipObservation(
    { userId: context.userId, membershipProviderObservationId: observationId },
    { query },
  )
  await finalizeVerified(context, options.claimToken, query)
  await query.commit()
  return true
}

async function findKnownSource(
  query: QueryExecutor,
  options: {
    environment: 'test' | 'production'
    applicationId: string
    purchaseTokenDigest: string
    userId: string | null
  },
): Promise<KnownSource | null> {
  const { rows } = await query<KnownSource>(sql`/* findKnownGooglePlayCurrentSource */
    SELECT source.user_id AS "userId", lineage.id AS "lineageId",
      prior.membership_product_id AS "membershipProductId",
      prior.membership_provider_product_id AS "membershipProviderProductId",
      prior.effective_at AS "effectiveAt", prior.expires_at AS "expiresAt"
    FROM membership_google_play_purchase_tokens token
    INNER JOIN membership_provider_lineages lineage ON lineage.id = token.membership_provider_lineage_id
    INNER JOIN membership_sources source ON source.membership_provider_lineage_id = lineage.id
    INNER JOIN membership_source_states state ON state.membership_source_id = source.id
    INNER JOIN membership_provider_observations prior ON prior.id = state.membership_provider_observation_id
    WHERE token.environment = ${options.environment} AND token.application_id = ${options.applicationId}
      AND token.purchase_token_lookup_sha256 = ${options.purchaseTokenDigest}
      AND lineage.provider = 'google_play' AND source.source_kind = 'direct'
      AND source.user_id IS NOT NULL AND (${options.userId}::UUID IS NULL OR source.user_id = ${options.userId}::UUID)
      AND state.expired_at IS NULL AND state.cancelled_at IS NULL
      AND prior.provider = 'google_play' AND prior.membership_provider_lineage_id = lineage.id
      AND prior.effective_at <= CURRENT_TIMESTAMP
      AND NOT EXISTS (
        SELECT 1 FROM membership_google_play_purchase_tokens successor
        WHERE successor.membership_provider_lineage_id = lineage.id
          AND successor.linked_purchase_token_lookup_sha256 = token.purchase_token_lookup_sha256
      ) LIMIT 1`)
  return rows[0] ?? null
}
