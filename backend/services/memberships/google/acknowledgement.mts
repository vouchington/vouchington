import { getMembershipWorkLimit } from '@services/memberships/work-limits'
import { createHash } from 'node:crypto'
import { type QueryExecutor, write } from '@data-stores/psql'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import type {
  GooglePlayMembershipProviderEnvironment,
  GooglePlaySubscriptionsV2Client,
} from './types.mts'
import { GooglePlayLineageConflictError } from './lineage.mts'
import { GooglePlaySubscriptionLookupError } from './configured-client.mts'

type GoogleAcknowledgementClaim = {
  id: string
  leaseToken: string
  encryptedPurchaseToken: Buffer
  purchaseTokenLookupSha256: string
  applicationId: string
  subscriptionId: string
}

export async function ensureGooglePlayAcknowledgement(options: {
  evidenceId: string
  lineageId: string
  environment: GooglePlayMembershipProviderEnvironment
  applicationId: string
  subscriptionId: string
  purchaseToken: string
  query?: QueryExecutor
}): Promise<string> {
  const query = options.query ?? write
  const lookup = createHash('sha256').update(options.purchaseToken).digest('hex')
  const encrypted = Buffer.from(
    encryptSecret(options.purchaseToken, `membership-google-play-acknowledgement:${lookup}`),
  )
  await query(sql`/* ensureGooglePlayAcknowledgement */
    WITH admitted AS (INSERT INTO membership_google_play_acknowledgements (
      membership_provider_evidence_record_id, membership_provider_lineage_id, environment, application_id, subscription_id, purchase_token_lookup_sha256, encrypted_purchase_token
    ) VALUES (${options.evidenceId}, ${options.lineageId}, ${options.environment}, ${options.applicationId}, ${options.subscriptionId}, ${lookup}, ${encrypted})
    ON CONFLICT (environment, application_id, purchase_token_lookup_sha256) DO UPDATE
      SET skipped_at = NULL, skip_reason = NULL
      WHERE membership_google_play_acknowledgements.skipped_at IS NOT NULL
        AND membership_google_play_acknowledgements.membership_provider_lineage_id = EXCLUDED.membership_provider_lineage_id
        AND membership_google_play_acknowledgements.subscription_id = EXCLUDED.subscription_id
    RETURNING id)
    UPDATE membership_google_play_acknowledgement_work_items work
    SET completed_at = NULL, available_at = clock_timestamp(), lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    FROM admitted WHERE work.membership_google_play_acknowledgement_id = admitted.id`)
  const { rows } = await query<{
    id: string
    membership_provider_lineage_id: string
    subscription_id: string
  }>(sql`
    /* ensureGooglePlayAcknowledgement.identity */
    SELECT id, membership_provider_lineage_id, subscription_id FROM membership_google_play_acknowledgements
    WHERE environment = ${options.environment} AND application_id = ${options.applicationId}
      AND purchase_token_lookup_sha256 = ${lookup} FOR KEY SHARE`)
  if (
    rows[0]?.membership_provider_lineage_id !== options.lineageId ||
    rows[0].subscription_id !== options.subscriptionId
  )
    throw new GooglePlayLineageConflictError()
  return rows[0].id
}

/** Acknowledgement reply loss is deliberately retried by refetching subscriptionsv2 first. */
export async function acknowledgeGooglePlayPurchase(options: {
  acknowledgementId: string
  client: GooglePlaySubscriptionsV2Client
}): Promise<'acknowledged' | 'skipped' | 'deferred'> {
  const claim = await claimGoogleAcknowledgement(options.acknowledgementId)
  if (!claim) return 'deferred'
  try {
    /* no-mistakes: integration=google-play */
    const current = await options.client.getSubscription({
      packageName: claim.applicationId,
      purchaseToken: decryptPurchaseToken(claim),
    })
    const currentlyEntitled =
      (current.subscriptionState === 'SUBSCRIPTION_STATE_ACTIVE' ||
        current.subscriptionState === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' ||
        current.subscriptionState === 'SUBSCRIPTION_STATE_CANCELED') &&
      current.lineItems?.some(
        item =>
          item.productId === claim.subscriptionId &&
          typeof item.expiryTime === 'string' &&
          new Date(item.expiryTime).getTime() > Date.now(),
      ) === true
    if (!currentlyEntitled) {
      await skipGoogleAcknowledgement(claim)
      return 'skipped'
    }
    if (current.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') {
      /* no-mistakes: integration=google-play */
      await options.client.acknowledgeSubscription({
        packageName: claim.applicationId,
        subscriptionId: claim.subscriptionId,
        purchaseToken: decryptPurchaseToken(claim),
      })
    }
    await completeGoogleAcknowledgement(claim)
    return 'acknowledged'
  } catch (err) {
    if (err instanceof GooglePlaySubscriptionLookupError && err.invalidPurchaseToken) {
      await skipGoogleAcknowledgement(claim)
      return 'skipped'
    }
    await deferGoogleAcknowledgement(claim, err)
    return 'deferred'
  }
}

async function claimGoogleAcknowledgement(id: string): Promise<GoogleAcknowledgementClaim | null> {
  const duration = getMembershipWorkLimit('verification_claim_minutes')
  const { rows } = await write<GoogleAcknowledgementClaim>(sql`/* claimGoogleAcknowledgement */
    WITH claimed AS (
      UPDATE membership_google_play_acknowledgement_work_items work
      SET lease_token = uuidv7(), leased_at = clock_timestamp(),
        lease_expires_at = clock_timestamp() + ${duration}::integer * INTERVAL '1 minute',
        attempt_count = attempt_count + 1, last_error = NULL
      FROM membership_google_play_acknowledgements acknowledgement
      WHERE work.membership_google_play_acknowledgement_id = ${id} AND acknowledgement.id = work.membership_google_play_acknowledgement_id
        AND acknowledgement.acknowledged_at IS NULL AND acknowledgement.skipped_at IS NULL
        AND work.completed_at IS NULL AND work.available_at <= clock_timestamp()
        AND (work.lease_token IS NULL OR work.lease_expires_at <= clock_timestamp())
      RETURNING work.membership_google_play_acknowledgement_id, work.lease_token
    ) SELECT acknowledgement.id, claimed.lease_token AS "leaseToken",
      acknowledgement.encrypted_purchase_token AS "encryptedPurchaseToken", acknowledgement.purchase_token_lookup_sha256 AS "purchaseTokenLookupSha256",
      acknowledgement.application_id AS "applicationId", acknowledgement.subscription_id AS "subscriptionId"
      FROM claimed JOIN membership_google_play_acknowledgements acknowledgement ON acknowledgement.id = claimed.membership_google_play_acknowledgement_id`)
  return rows[0] ?? null
}
function decryptPurchaseToken(claim: GoogleAcknowledgementClaim): string {
  return decryptSecret(
    claim.encryptedPurchaseToken.toString(),
    `membership-google-play-acknowledgement:${claim.purchaseTokenLookupSha256}`,
  )
}
async function completeGoogleAcknowledgement(claim: GoogleAcknowledgementClaim): Promise<void> {
  await recordGoogleAcknowledgementOutcome(claim, false)
}
async function skipGoogleAcknowledgement(claim: GoogleAcknowledgementClaim): Promise<void> {
  await recordGoogleAcknowledgementOutcome(claim, true)
}
async function recordGoogleAcknowledgementOutcome(
  claim: GoogleAcknowledgementClaim,
  skipped: boolean,
): Promise<void> {
  await write(sql`/* recordGoogleAcknowledgementOutcome */
    WITH completed AS (
      UPDATE membership_google_play_acknowledgement_work_items
      SET completed_at = clock_timestamp(), lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
      WHERE membership_google_play_acknowledgement_id = ${claim.id} AND lease_token = ${claim.leaseToken}
        AND lease_expires_at > clock_timestamp() AND completed_at IS NULL
      RETURNING membership_google_play_acknowledgement_id
    ) UPDATE membership_google_play_acknowledgements acknowledgement
      SET acknowledged_at = CASE WHEN ${skipped} THEN NULL ELSE clock_timestamp() END,
          skipped_at = CASE WHEN ${skipped} THEN clock_timestamp() ELSE NULL END,
          skip_reason = CASE WHEN ${skipped} THEN 'no_longer_eligible'::membership_google_play_acknowledgement_skip_reasons ELSE NULL END
      FROM completed WHERE acknowledgement.id = completed.membership_google_play_acknowledgement_id
        AND acknowledgement.acknowledged_at IS NULL AND acknowledgement.skipped_at IS NULL`)
}
async function deferGoogleAcknowledgement(
  claim: GoogleAcknowledgementClaim,
  error: unknown,
): Promise<void> {
  const delay = getMembershipWorkLimit('verification_retry_minutes')
  const message =
    error instanceof Error ? error.message.slice(0, 1000) : 'Google acknowledgement failed'
  await write(sql`/* deferGoogleAcknowledgement */
    UPDATE membership_google_play_acknowledgement_work_items
    SET lease_token = NULL, leased_at = NULL, lease_expires_at = NULL,
      available_at = clock_timestamp() + ${delay}::integer * INTERVAL '1 minute', last_error = ${message}
    WHERE membership_google_play_acknowledgement_id = ${claim.id} AND lease_token = ${claim.leaseToken}
      AND lease_expires_at > clock_timestamp() AND completed_at IS NULL`)
}
