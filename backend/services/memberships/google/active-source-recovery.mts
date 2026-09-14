import { createHash } from 'node:crypto'
import { write } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import { createMembershipVerification } from '../verifications.mts'
import { processGooglePlayMembershipVerification } from './process-verification.mts'
import {
  advanceGooglePlayRecoverySweep,
  beginGooglePlayRecoverySweep,
  pageGooglePlayRecoveryItems,
} from './recovery-cursor.mts'
import sql from 'sql-template-strings'
import type { GooglePlaySubscriptionsV2Client } from './types.mts'

const RECOVERY_CURSOR_ID = 'active_sources'
const RECOVERY_BATCH_SIZE = 500
const SWEEP_BUCKET_MS = 60 * 60 * 1000

export type GooglePlayActiveSourceRecoveryBatch = {
  sourceIds: string[]
  previousCursor: string | null
  previousUpperBound: string | null
  sweepUpperBound: string | null
  nextCursor: string | null
  completesSweep: boolean
}

/** Finds bounded, currently active or recently stale direct Google sources. */
export async function findRecoverableGooglePlayActiveSourceJobs(): Promise<GooglePlayActiveSourceRecoveryBatch> {
  const cursor = await beginGooglePlayRecoverySweep({
    cursorId: RECOVERY_CURSOR_ID,
    findUpperBound: findActiveSourceSweepUpperBound,
  })
  const page = pageGooglePlayRecoveryItems(
    cursor,
    await findSourcesAfterCursor(cursor.previousCursor, cursor.sweepUpperBound),
    RECOVERY_BATCH_SIZE,
  )
  return { ...page, sourceIds: page.items.map(item => item.id) }
}

/** Advances only when the caller's fan-out still owns the cursor it scanned. */
export async function advanceGooglePlayActiveSourceRecoveryCursor(
  batch: GooglePlayActiveSourceRecoveryBatch,
): Promise<void> {
  await advanceGooglePlayRecoverySweep({ cursorId: RECOVERY_CURSOR_ID, ...batch })
}

/** Revalidates and reconciles one source; the queue payload never contains the raw token. */
export async function reconcileGooglePlayActiveSource(options: {
  sourceId: string
  client: GooglePlaySubscriptionsV2Client
}): Promise<void> {
  const context = await getActiveSourceContext(options.sourceId)
  if (!context) return
  const purchaseToken = decryptSecret(
    context.encryptedPurchaseToken.toString(),
    `membership-google-play-token:${context.purchaseTokenLookupSha256}`,
  )
  const idempotencyKey = createGooglePlayActiveSourceIdempotencyKey(
    context.sourceId,
    context.purchaseTokenLookupSha256,
    Math.floor(Date.now() / SWEEP_BUCKET_MS).toString(),
  )
  const verification = await createMembershipVerification({
    userId: context.userId,
    provider: 'google_play',
    purchaseIntentId: null,
    idempotencyKey,
    trustedProviderContext: {
      environment: context.environment,
      applicationId: context.applicationId,
    },
    evidence: {
      purchase_token: purchaseToken,
      active_source_id: context.sourceId,
      active_source_reconciliation: idempotencyKey,
    },
  })
  await processGooglePlayMembershipVerification(verification.id, { client: options.client })
}

async function findSourcesAfterCursor(cursor: string | null, upperBound: string | null) {
  const { rows } = await write<{
    sourceId: string
  }>(sql`/* findGooglePlayActiveSourceRecoveryBatch.sources */
    SELECT source.id AS "sourceId"
    FROM membership_sources source
    INNER JOIN membership_source_states state ON state.membership_source_id = source.id
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = source.membership_provider_lineage_id
    INNER JOIN LATERAL (
      SELECT token.purchase_token_lookup_sha256
      FROM membership_google_play_purchase_tokens token
      WHERE token.membership_provider_lineage_id = lineage.id
        AND NOT EXISTS (
          SELECT 1 FROM membership_google_play_purchase_tokens successor
          WHERE successor.membership_provider_lineage_id = lineage.id
            AND successor.linked_purchase_token_lookup_sha256 = token.purchase_token_lookup_sha256
        )
      ORDER BY token.id DESC
      LIMIT 1
    ) token ON true
    WHERE source.source_kind = 'direct'
      AND source.user_id IS NOT NULL
      AND lineage.provider = 'google_play'
      AND state.cancelled_at IS NULL
      AND state.expired_at IS NULL
      AND (${cursor}::UUID IS NULL OR source.id > ${cursor}::UUID)
      AND (${upperBound}::UUID IS NULL OR source.id <= ${upperBound}::UUID)
    ORDER BY source.id
    LIMIT ${RECOVERY_BATCH_SIZE + 1}`)
  return rows.map(row => ({ id: row.sourceId }))
}

async function findActiveSourceSweepUpperBound(): Promise<string | null> {
  const { rows } = await write<{
    id: string | null
  }>(sql`/* findGooglePlayActiveSourceSweepUpperBound */
    SELECT source.id FROM membership_sources source
    INNER JOIN membership_source_states state ON state.membership_source_id = source.id
    INNER JOIN membership_provider_lineages lineage ON lineage.id = source.membership_provider_lineage_id
    WHERE source.source_kind = 'direct' AND source.user_id IS NOT NULL
      AND lineage.provider = 'google_play' AND state.cancelled_at IS NULL AND state.expired_at IS NULL
    ORDER BY source.id DESC LIMIT 1`)
  return rows[0]?.id ?? null
}

type ActiveSourceContext = {
  sourceId: string
  userId: string
  environment: 'test' | 'production'
  applicationId: string
  encryptedPurchaseToken: Buffer
  purchaseTokenLookupSha256: string
}

async function getActiveSourceContext(sourceId: string): Promise<ActiveSourceContext | null> {
  const { rows } = await write<ActiveSourceContext>(sql`/* getGooglePlayActiveSourceContext */
    SELECT source.id AS "sourceId", source.user_id AS "userId",
      lineage.environment, lineage.application_id AS "applicationId",
      token.encrypted_purchase_token AS "encryptedPurchaseToken",
      token.purchase_token_lookup_sha256 AS "purchaseTokenLookupSha256"
    FROM membership_sources source
    INNER JOIN membership_source_states state ON state.membership_source_id = source.id
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = source.membership_provider_lineage_id
    INNER JOIN LATERAL (
      SELECT token.encrypted_purchase_token, token.purchase_token_lookup_sha256
      FROM membership_google_play_purchase_tokens token
      WHERE token.membership_provider_lineage_id = lineage.id
        AND NOT EXISTS (
          SELECT 1 FROM membership_google_play_purchase_tokens successor
          WHERE successor.membership_provider_lineage_id = lineage.id
            AND successor.linked_purchase_token_lookup_sha256 = token.purchase_token_lookup_sha256
        )
      ORDER BY token.id DESC
      LIMIT 1
    ) token ON true
    WHERE source.id = ${sourceId}::UUID
      AND source.source_kind = 'direct'
      AND source.user_id IS NOT NULL
      AND lineage.provider = 'google_play'
      AND state.cancelled_at IS NULL
      AND state.expired_at IS NULL`)
  return rows[0] ?? null
}

function createGooglePlayActiveSourceIdempotencyKey(
  sourceId: string,
  purchaseTokenLookupSha256: string,
  sweepBucket: string,
): string {
  const digest = createHash('sha256')
    .update(`google-play-active-source:${sourceId}:${purchaseTokenLookupSha256}:${sweepBucket}`)
    .digest('hex')
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`
}
