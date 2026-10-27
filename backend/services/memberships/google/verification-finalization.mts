import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { projectVerifiedProviderMembershipObservation } from '../provider-observation-projection.mts'
import { ensureGooglePlayAcknowledgement } from './acknowledgement.mts'
import { createProviderMembershipSource } from '../provider-source.mts'
import {
  persistGooglePlayTokenLineage,
  resolveGooglePlayTokenLineage,
  tokenDigest,
} from './lineage.mts'
import {
  acceptObservation,
  allocateGooglePlayObservationOrder,
  finalizeVerified,
  getMapping,
} from './verification-persistence.mts'
import type { Context } from './process-verification-types.mts'
import type { GooglePlayVerifiedMembershipObservation } from './types.mts'

type GooglePlayTransaction = Awaited<ReturnType<typeof beginTransaction>>
type GooglePlayResolution = Awaited<ReturnType<typeof resolveGooglePlayTokenLineage>>

export async function persistPendingGooglePlaySource(
  context: Context,
  resolved: GooglePlayResolution,
  query: GooglePlayTransaction,
): Promise<void> {
  await persistGooglePlayTokenLineage(
    { environment: context.environment, applicationId: context.applicationId, resolved },
    query,
  )
  await createProviderMembershipSource(
    {
      userId: context.userId,
      sourceKind: 'direct',
      sourceIdentity: {
        provider: 'google_play',
        environment: context.environment,
        applicationId: context.applicationId,
        providerLineageId: resolved.rootDigest,
      },
    },
    query,
  )
}

async function isLatestGooglePlayPurchaseToken(options: {
  environment: 'test' | 'production'
  applicationId: string
  lineageId: string
  purchaseToken: string
  query: GooglePlayTransaction
}): Promise<boolean> {
  const { rows } = await options.query<{
    current: boolean
  }>(sql`/* isLatestGooglePlayPurchaseToken */
    SELECT EXISTS (
      SELECT 1 FROM membership_google_play_purchase_tokens token
      INNER JOIN membership_provider_contexts context ON context.id = token.membership_provider_context_id
      WHERE token.membership_provider_lineage_id = ${options.lineageId}
        AND context.provider = 'google_play'
        AND context.environment = ${options.environment}
        AND context.application_id = ${options.applicationId}
        AND token.purchase_token_lookup_sha256 = ${tokenDigest(options.purchaseToken)}
        AND token.fetched_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM membership_google_play_purchase_tokens successor
          WHERE successor.linked_purchase_token_id = token.id
            AND successor.fetched_at IS NOT NULL
        )
    ) AS current`)
  return rows.at(0)?.current ?? false
}

export async function persistVerifiedGooglePlayObservation(
  context: Context,
  resolved: GooglePlayResolution,
  mapping: NonNullable<Awaited<ReturnType<typeof getMapping>>>,
  observation: GooglePlayVerifiedMembershipObservation,
  providerOrder: number,
  query: GooglePlayTransaction,
): Promise<{ lineageId: string; observationId: string }> {
  const { lineageId, submittedTokenFirstFetched } = await persistGooglePlayTokenLineage(
    { environment: context.environment, applicationId: context.applicationId, resolved },
    query,
  )
  const { rows: latest } = await query<{ providerOrder: string | null }>(
    sql`/* latestGooglePlayLineageObservationOrder */
      SELECT max(provider_order)::TEXT AS "providerOrder" FROM membership_provider_observations
      WHERE membership_provider_lineage_id = ${lineageId}`,
  )
  const latestOrder = Number(latest[0]?.providerOrder ?? 0)
  const submittedToken = resolved.tokens[0]
  const firstSuccessor =
    submittedTokenFirstFetched && submittedToken?.linkedToken
      ? ((
          await query<{ first: boolean }>(sql`/* firstGooglePlaySuccessor */
            SELECT NOT EXISTS (
              SELECT 1 FROM membership_google_play_purchase_tokens sibling
              INNER JOIN membership_google_play_purchase_tokens predecessor
                ON predecessor.id = sibling.linked_purchase_token_id
              WHERE sibling.membership_provider_lineage_id = ${lineageId}
                AND predecessor.purchase_token_lookup_sha256 = ${tokenDigest(submittedToken.linkedToken)}
                AND sibling.purchase_token_lookup_sha256 <> ${tokenDigest(submittedToken.token)}
                AND sibling.fetched_at IS NOT NULL
            ) AS first`)
        ).rows.at(0)?.first ?? false)
      : false
  const observationOrder =
    firstSuccessor && latestOrder > providerOrder
      ? await allocateGooglePlayObservationOrder()
      : providerOrder
  const observationId = await acceptObservation(
    context,
    lineageId,
    mapping,
    { ...observation, providerOrder: observationOrder },
    query,
  )
  return { lineageId, observationId }
}

export async function finalizeVerifiedGooglePlayMembership(options: {
  context: Context
  mapping: NonNullable<Awaited<ReturnType<typeof getMapping>>>
  purchaseToken: string
  acknowledgementPending: boolean
  lineageId: string
  observationId: string
  query: GooglePlayTransaction
}): Promise<{ acknowledgementId: string | null }> {
  await finalizeVerified(options.context, options.query)
  const current = await isLatestGooglePlayPurchaseToken({
    environment: options.context.environment,
    applicationId: options.context.applicationId,
    lineageId: options.lineageId,
    purchaseToken: options.purchaseToken,
    query: options.query,
  })
  if (current)
    await projectVerifiedProviderMembershipObservation(
      {
        userId: options.context.userId,
        membershipProviderObservationId: options.observationId,
        retainWhenDirectAdmissionRejected: true,
      },
      { query: options.query },
    )
  const acknowledgementId = options.acknowledgementPending
    ? await ensureGooglePlayAcknowledgement({
        evidenceId: options.context.evidenceId,
        lineageId: options.lineageId,
        environment: options.context.environment,
        applicationId: options.context.applicationId,
        subscriptionId: options.mapping.providerProductId,
        purchaseToken: options.purchaseToken,
        query: options.query,
      })
    : null
  await options.query.commit()
  return { acknowledgementId }
}
