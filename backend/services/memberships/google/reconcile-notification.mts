import { createHash } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { createMembershipVerification } from '../verifications.mts'
import {
  createConfiguredGooglePlaySubscriptionsV2Client,
  GooglePlaySubscriptionLookupError,
} from './configured-client.mts'
import { MembershipProviderUnavailableError } from '../provider-unavailable.mts'
import {
  getLatestKnownGooglePlayPurchaseToken,
  persistGooglePlayTokenLineage,
  resolveGooglePlayTokenLineage,
} from './lineage.mts'
import { getKnownGooglePlayTokenLineage } from './known-lineage.mts'
import { parseGooglePlayRtdn } from './rtdn.mts'
import { getKnownGooglePlayCurrentSource } from './permanent-lookup-loss.mts'
import type { GooglePlaySubscriptionsV2Client } from './types.mts'

/** Replays a durable RTDN trigger into the same authoritative worker verifier used by purchases. */
export async function reconcileGooglePlayRtdnNotification(options: {
  evidenceId: string
  client?: GooglePlaySubscriptionsV2Client
}): Promise<void> {
  const context = await loadNotification(options.evidenceId)
  if (!context) return
  const event = decryptNotification(context)
  if (!event) return rejectNotification(context.evidenceId, 'invalid_google_rtdn')
  if ('kind' in event && event.kind === 'ignored')
    return rejectNotification(context.evidenceId, 'invalid_google_rtdn')
  const purchaseToken =
    (await getLatestKnownGooglePlayPurchaseToken({
      environment: context.environment,
      applicationId: context.applicationId,
      purchaseToken: event.purchaseToken,
    })) ?? event.purchaseToken
  const known = await getKnownGooglePlayCurrentSource({
    environment: context.environment,
    applicationId: context.applicationId,
    purchaseTokenDigest: createHash('sha256').update(purchaseToken).digest('hex'),
  })
  if (known) return processBoundNotification(context, known.lineageId, known.userId, purchaseToken)
  const knownLineage = await getKnownGooglePlayTokenLineage({
    environment: context.environment,
    applicationId: context.applicationId,
    purchaseToken,
  })
  if (knownLineage) {
    if (!knownLineage.boundUserId) return
    return processBoundNotification(
      context,
      knownLineage.lineageId,
      knownLineage.boundUserId,
      purchaseToken,
    )
  }
  let resolved: Awaited<ReturnType<typeof resolveGooglePlayTokenLineage>>
  try {
    resolved = await resolveGooglePlayTokenLineage({
      client: options.client ?? createConfiguredGooglePlaySubscriptionsV2Client(),
      environment: context.environment,
      applicationId: context.applicationId,
      purchaseToken,
    })
  } catch (err) {
    if (err instanceof MembershipProviderUnavailableError)
      return rejectNotification(context.evidenceId, 'provider_unavailable')
    if (
      err instanceof GooglePlaySubscriptionLookupError &&
      err.invalidPurchaseToken &&
      err.purchaseTokenDigest === createHash('sha256').update(purchaseToken).digest('hex')
    )
      return rejectNotification(context.evidenceId, 'invalid_evidence')
    throw err
  }
  await using query = await beginTransaction()
  const { lineageId } = await persistGooglePlayTokenLineage(
    { environment: context.environment, applicationId: context.applicationId, resolved },
    query,
  )
  const { rows } = await query<{
    user_id: string
  }>(sql`/* reconcileGooglePlayRtdnNotification.binding */
    SELECT user_id FROM membership_lineage_bindings WHERE membership_provider_lineage_id = ${lineageId}
      AND source_kind = 'direct' AND released_at IS NULL FOR KEY SHARE`)
  const userId = rows[0]?.user_id
  if (!userId) {
    // Retain the trigger for a later signed-in proof, but keep the canonical token alias.
    await query.commit()
    return
  }
  await query.commit()
  const latestPurchaseToken =
    (await getLatestKnownGooglePlayPurchaseToken({
      environment: context.environment,
      applicationId: context.applicationId,
      purchaseToken,
    })) ?? purchaseToken
  await processBoundNotification(context, lineageId, userId, latestPurchaseToken)
}

async function processBoundNotification(
  context: NotificationContext,
  lineageId: string,
  userId: string,
  purchaseToken: string,
): Promise<void> {
  const verification = await createMembershipVerification({
    userId,
    provider: 'google_play',
    purchaseIntentId: null,
    idempotencyKey: context.evidenceId,
    trustedProviderContext: {
      environment: context.environment,
      applicationId: context.applicationId,
    },
    // Event identity makes this a fresh immutable observation even when the token evidence was
    // previously verified; subscriptionsv2 is refetched for every RTDN state transition.
    evidence: { purchase_token: purchaseToken, rtdn_evidence_id: context.evidenceId },
  })
  // The canonical job owns provider calls and pacing. Receipt recovery reuses this verification
  // and finalizes the RTDN evidence only after its durable outcome exists.
  const { rows: outcomes } = await write<{
    verified_at: Date | null
    conflicted_at: Date | null
    rejected_at: Date | null
    result_code: string | null
  }>(sql`/* reconcileGooglePlayRtdnNotification.outcome */
    SELECT verified_at, conflicted_at, rejected_at, result_code
    FROM membership_verifications WHERE id = ${verification.id}`)
  const outcome = outcomes[0]
  if (outcome?.verified_at)
    await write(
      sql`/* reconcileGooglePlayRtdnNotification.complete */ UPDATE membership_provider_evidence_records SET membership_provider_lineage_id = ${lineageId}, verified_at = CURRENT_TIMESTAMP WHERE id = ${context.evidenceId} AND verified_at IS NULL AND rejected_at IS NULL`,
    )
  else if (outcome?.conflicted_at || outcome?.rejected_at)
    await rejectNotification(context.evidenceId, outcome.result_code ?? 'invalid_evidence')
}
type NotificationContext = {
  evidenceId: string
  environment: 'test' | 'production'
  applicationId: string
  encryptedEvidence: Buffer
  lookup: string
}
async function loadNotification(evidenceId: string): Promise<NotificationContext | null> {
  const { rows } = await write<NotificationContext>(
    sql`/* loadGooglePlayRtdnNotification */ SELECT evidence.id AS "evidenceId", context.environment, context.application_id AS "applicationId", evidence.encrypted_evidence AS "encryptedEvidence", evidence.evidence_lookup_sha256 AS lookup FROM membership_provider_evidence_records evidence INNER JOIN membership_provider_contexts context ON context.id = evidence.membership_provider_context_id WHERE evidence.id = ${evidenceId} AND context.provider = 'google_play' AND evidence.provider_event_id IS NOT NULL AND evidence.verified_at IS NULL AND evidence.rejected_at IS NULL LIMIT 1`,
  )
  return rows[0] ?? null
}
function decryptNotification(context: NotificationContext) {
  return parseGooglePlayRtdn(
    Buffer.from(
      decryptSecret(
        context.encryptedEvidence.toString(),
        `membership-provider-evidence:google_play:${context.lookup}`,
      ),
    ),
    context.applicationId,
  )
}
async function rejectNotification(evidenceId: string, reason: string): Promise<void> {
  await write(
    sql`/* rejectGooglePlayRtdnNotification */ UPDATE membership_provider_evidence_records SET rejected_at = CURRENT_TIMESTAMP, rejection_reason = ${reason} WHERE id = ${evidenceId} AND verified_at IS NULL AND rejected_at IS NULL`,
  )
}
