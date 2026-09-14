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
import {
  advanceGooglePlayRecoverySweep,
  beginGooglePlayRecoverySweep,
  pageGooglePlayRecoveryItems,
} from './recovery-cursor.mts'

type GoogleAcknowledgementClaim = {
  id: string
  claimToken: string
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
    INSERT INTO membership_google_play_acknowledgements (
      membership_provider_evidence_id, membership_provider_lineage_id, environment, application_id, subscription_id, purchase_token_lookup_sha256, encrypted_purchase_token
    ) VALUES (${options.evidenceId}, ${options.lineageId}, ${options.environment}, ${options.applicationId}, ${options.subscriptionId}, ${lookup}, ${encrypted})
    ON CONFLICT (environment, application_id, purchase_token_lookup_sha256) DO UPDATE
      SET skipped_at = NULL, skip_reason = NULL, next_attempt_at = CURRENT_TIMESTAMP
      WHERE membership_google_play_acknowledgements.skipped_at IS NOT NULL
        AND membership_google_play_acknowledgements.membership_provider_lineage_id = EXCLUDED.membership_provider_lineage_id
        AND membership_google_play_acknowledgements.subscription_id = EXCLUDED.subscription_id`)
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
  } catch (error) {
    if (error instanceof GooglePlaySubscriptionLookupError && error.invalidPurchaseToken) {
      await skipGoogleAcknowledgement(claim)
      return 'skipped'
    }
    await deferGoogleAcknowledgement(claim, error)
    return 'deferred'
  }
}

export type GooglePlayAcknowledgementRecoveryBatch = {
  acknowledgementIds: string[]
  previousCursor: string | null
  previousUpperBound: string | null
  sweepUpperBound: string | null
  nextCursor: string | null
  completesSweep: boolean
}

export async function findDueGooglePlayAcknowledgementIds(): Promise<GooglePlayAcknowledgementRecoveryBatch> {
  const cursor = await beginGooglePlayRecoverySweep({
    cursorId: 'acknowledgements',
    findUpperBound: findAcknowledgementSweepUpperBound,
  })
  const page = pageGooglePlayRecoveryItems(
    cursor,
    await findDueAcknowledgementsAfter(cursor.previousCursor, cursor.sweepUpperBound),
    500,
  )
  return { ...page, acknowledgementIds: page.items.map(item => item.id) }
}

async function findDueAcknowledgementsAfter(cursor: string | null, upperBound: string | null) {
  const { rows } = await write<{ id: string }>(sql`/* findDueGooglePlayAcknowledgementIds */
    SELECT id FROM membership_google_play_acknowledgements WHERE acknowledged_at IS NULL AND skipped_at IS NULL AND next_attempt_at <= CURRENT_TIMESTAMP
      AND (attempt_claim_token IS NULL OR attempt_claimed_at < CURRENT_TIMESTAMP - INTERVAL '30 minutes')
      AND (${cursor}::UUID IS NULL OR id > ${cursor}::UUID)
      AND (${upperBound}::UUID IS NULL OR id <= ${upperBound}::UUID)
    ORDER BY id LIMIT 501`)
  return rows
}

async function findAcknowledgementSweepUpperBound(): Promise<string | null> {
  const { rows } = await write<{
    id: string | null
  }>(sql`/* findGooglePlayAcknowledgementSweepUpperBound */
    SELECT id FROM membership_google_play_acknowledgements
    WHERE acknowledged_at IS NULL AND skipped_at IS NULL AND next_attempt_at <= CURRENT_TIMESTAMP
      AND (attempt_claim_token IS NULL OR attempt_claimed_at < CURRENT_TIMESTAMP - INTERVAL '30 minutes')
    ORDER BY id DESC LIMIT 1`)
  return rows[0]?.id ?? null
}

export async function advanceGooglePlayAcknowledgementRecoveryCursor(
  batch: GooglePlayAcknowledgementRecoveryBatch,
): Promise<void> {
  await advanceGooglePlayRecoverySweep({ cursorId: 'acknowledgements', ...batch })
}

async function claimGoogleAcknowledgement(id: string): Promise<GoogleAcknowledgementClaim | null> {
  const { rows } = await write<GoogleAcknowledgementClaim>(sql`/* claimGoogleAcknowledgement */
    UPDATE membership_google_play_acknowledgements SET attempt_claim_token = uuidv7(), attempt_claimed_at = CURRENT_TIMESTAMP,
      attempt_count = attempt_count + 1, last_error = NULL
    WHERE id = ${id} AND acknowledged_at IS NULL AND skipped_at IS NULL AND next_attempt_at <= CURRENT_TIMESTAMP
      AND (attempt_claim_token IS NULL OR attempt_claimed_at < CURRENT_TIMESTAMP - INTERVAL '30 minutes')
    RETURNING id, attempt_claim_token AS "claimToken", encrypted_purchase_token AS "encryptedPurchaseToken", purchase_token_lookup_sha256 AS "purchaseTokenLookupSha256", application_id AS "applicationId", subscription_id AS "subscriptionId"`)
  return rows[0] ?? null
}
function decryptPurchaseToken(claim: GoogleAcknowledgementClaim): string {
  return decryptSecret(
    claim.encryptedPurchaseToken.toString(),
    `membership-google-play-acknowledgement:${claim.purchaseTokenLookupSha256}`,
  )
}
async function completeGoogleAcknowledgement(claim: GoogleAcknowledgementClaim): Promise<void> {
  await write(sql`/* completeGoogleAcknowledgement */ UPDATE membership_google_play_acknowledgements
    SET acknowledged_at = CURRENT_TIMESTAMP, attempt_claim_token = NULL, attempt_claimed_at = NULL
    WHERE id = ${claim.id} AND attempt_claim_token = ${claim.claimToken}`)
}
async function skipGoogleAcknowledgement(claim: GoogleAcknowledgementClaim): Promise<void> {
  await write(sql`/* skipGoogleAcknowledgement */ UPDATE membership_google_play_acknowledgements
    SET skipped_at = CURRENT_TIMESTAMP, skip_reason = 'no_longer_eligible',
      attempt_claim_token = NULL, attempt_claimed_at = NULL
    WHERE id = ${claim.id} AND attempt_claim_token = ${claim.claimToken}`)
}
async function deferGoogleAcknowledgement(
  claim: GoogleAcknowledgementClaim,
  error: unknown,
): Promise<void> {
  const message =
    error instanceof Error ? error.message.slice(0, 1000) : 'Google acknowledgement failed'
  await write(sql`/* deferGoogleAcknowledgement */ UPDATE membership_google_play_acknowledgements
    SET attempt_claim_token = NULL, attempt_claimed_at = NULL, next_attempt_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes', last_error = ${message}
    WHERE id = ${claim.id} AND attempt_claim_token = ${claim.claimToken}`)
}
