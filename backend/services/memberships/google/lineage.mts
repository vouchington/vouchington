import { createHash } from 'node:crypto'
import { write, type QueryExecutor } from '@data-stores/psql'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { getKnownGooglePlayCanonicalRoot } from './canonical-root.mts'
import { fetchGooglePlaySubscription } from './subscription-fetch.mts'
import { GooglePlaySubscriptionLookupError } from './configured-client.mts'
import type { GooglePlaySubscriptionV2, GooglePlaySubscriptionsV2Client } from './types.mts'

const MAX_LINKED_TOKEN_DEPTH = 100
export class GooglePlayLineageConflictError extends Error {
  constructor() {
    super('Google Play purchase token belongs to another canonical lineage')
    this.name = 'GooglePlayLineageConflictError'
  }
}
export type GooglePlayResolvedLineage = {
  rootToken: string
  rootDigest: string
  currentSubscription: GooglePlaySubscriptionV2
  tokens: Array<{ token: string; linkedToken: string | null }>
}

/** Bounded worker-only traversal; repeated or cyclic linked tokens are rejected. */
export async function resolveGooglePlayTokenLineage(options: {
  client: GooglePlaySubscriptionsV2Client
  environment: 'test' | 'production'
  applicationId: string
  purchaseToken: string
  currentSubscription?: GooglePlaySubscriptionV2
}): Promise<GooglePlayResolvedLineage> {
  const { environment, applicationId } = options
  const seen = new Set<string>()
  const tokens: Array<{ token: string; linkedToken: string | null }> = []
  let token = options.purchaseToken
  let currentSubscription: GooglePlaySubscriptionV2 | undefined
  for (let depth = 0; depth < MAX_LINKED_TOKEN_DEPTH; depth++) {
    const digest = tokenDigest(token)
    if (seen.has(digest)) throw new Error('Google Play linked purchase-token cycle')
    seen.add(digest)
    // An ancestor can become unavailable after Google's retention window. A durable alias ends traversal.
    if (depth > 0) {
      // eslint-disable-next-line no-await-in-loop -- each ancestor depends on the prior token
      const known = await getKnownGooglePlayCanonicalRoot(environment, applicationId, digest)
      if (known)
        return {
          rootToken: token,
          rootDigest: known,
          currentSubscription: currentSubscription!,
          tokens,
        }
    }
    let subscription: GooglePlaySubscriptionV2
    try {
      if (depth === 0 && options.currentSubscription) subscription = options.currentSubscription
      else {
        // eslint-disable-next-line no-await-in-loop -- each ancestor depends on the prior response
        subscription = await fetchGooglePlaySubscription({
          client: options.client,
          applicationId,
          purchaseToken: token,
        })
      }
    } catch (error) {
      if (
        depth > 0 &&
        error instanceof GooglePlaySubscriptionLookupError &&
        (error.status === 404 ||
          error.status === 410 ||
          (error.status === 400 && error.reason === 'subscriptionExpired'))
      ) {
        tokens.push({ token, linkedToken: null })
        return {
          rootToken: token,
          rootDigest: digest,
          currentSubscription: currentSubscription!,
          tokens,
        }
      }
      throw error
    }
    currentSubscription ??= subscription
    if (depth === 0) {
      // eslint-disable-next-line no-await-in-loop -- this lookup follows the current token fetch
      const knownRoot = await getKnownGooglePlayCanonicalRoot(environment, applicationId, digest)
      if (knownRoot) {
        tokens.push({ token, linkedToken: requiredText(subscription.linkedPurchaseToken) })
        return { rootToken: token, rootDigest: knownRoot, currentSubscription, tokens }
      }
    }
    const expiredToken = requiredText(subscription.outOfAppPurchaseContext?.expiredPurchaseToken)
    if (expiredToken && !subscription.linkedPurchaseToken) {
      // eslint-disable-next-line no-await-in-loop -- expired ancestry follows the provider response
      const knownRoot = await getKnownGooglePlayCanonicalRoot(
        environment,
        applicationId,
        tokenDigest(expiredToken),
      )
      tokens.push({ token, linkedToken: expiredToken })
      return {
        rootToken: knownRoot ? expiredToken : token,
        rootDigest: knownRoot ?? digest,
        currentSubscription,
        tokens,
      }
    }
    const linkedToken = requiredText(subscription.linkedPurchaseToken)
    tokens.push({ token, linkedToken })
    if (!linkedToken) return { rootToken: token, rootDigest: digest, currentSubscription, tokens }
    token = linkedToken
  }
  throw new Error(`Google Play linked purchase-token chain exceeded ${MAX_LINKED_TOKEN_DEPTH}`)
}
/** A delayed RTDN for an ancestor must recheck the newest persisted successor, not reproject stale state. */
export async function getLatestKnownGooglePlayPurchaseToken(options: {
  environment: 'test' | 'production'
  applicationId: string
  purchaseToken: string
}): Promise<string | null> {
  const digest = tokenDigest(options.purchaseToken)
  const { rows } = await write<{
    encrypted_purchase_token: Buffer
    purchase_token_lookup_sha256: string
  }>(sql`/* getLatestKnownGooglePlayPurchaseToken */
    SELECT latest.encrypted_purchase_token, latest.purchase_token_lookup_sha256
    FROM membership_google_play_purchase_tokens known
    INNER JOIN membership_google_play_purchase_tokens latest
      ON latest.membership_provider_lineage_id = known.membership_provider_lineage_id
      AND latest.environment = known.environment AND latest.application_id = known.application_id
    WHERE known.environment = ${options.environment} AND known.application_id = ${options.applicationId}
      AND known.purchase_token_lookup_sha256 = ${digest}
      AND NOT EXISTS (
        SELECT 1 FROM membership_google_play_purchase_tokens successor
        WHERE successor.membership_provider_lineage_id = known.membership_provider_lineage_id
          AND successor.linked_purchase_token_lookup_sha256 = latest.purchase_token_lookup_sha256
      )
    ORDER BY latest.id DESC LIMIT 1`)
  const latest = rows[0]
  return latest
    ? decryptSecret(
        latest.encrypted_purchase_token.toString(),
        `membership-google-play-token:${latest.purchase_token_lookup_sha256}`,
      )
    : null
}
export async function persistGooglePlayTokenLineage(
  options: {
    environment: 'test' | 'production'
    applicationId: string
    resolved: GooglePlayResolvedLineage
  },
  query: QueryExecutor,
): Promise<{ lineageId: string; submittedTokenInserted: boolean }> {
  const { rows: inserted } = await query<{
    id: string
  }>(sql`/* persistGooglePlayTokenLineage.lineage */
    INSERT INTO membership_provider_lineages (provider, environment, application_id, provider_lineage_id)
    VALUES ('google_play', ${options.environment}, ${options.applicationId}, ${options.resolved.rootDigest})
    ON CONFLICT (provider, environment, application_id, provider_lineage_id) DO NOTHING RETURNING id`)
  const lineageId =
    inserted[0]?.id ??
    (
      await query<{ id: string }>(sql`/* persistGooglePlayTokenLineage.existingLineage */
    SELECT id FROM membership_provider_lineages WHERE provider = 'google_play' AND environment = ${options.environment} AND application_id = ${options.applicationId} AND provider_lineage_id = ${options.resolved.rootDigest} FOR UPDATE`)
    ).rows[0]?.id
  if (!lineageId) throw new Error('Google Play canonical lineage was not returned')
  let submittedTokenInserted = false
  for (const [index, item] of options.resolved.tokens.entries()) {
    const digest = tokenDigest(item.token)
    const linkedDigest = item.linkedToken ? tokenDigest(item.linkedToken) : null
    const encrypted = Buffer.from(
      encryptSecret(item.token, `membership-google-play-token:${digest}`),
    )
    // eslint-disable-next-line no-await-in-loop -- aliases share a locked canonical lineage
    const { rows: insertedToken } = await query<{
      id: string
    }>(sql`/* persistGooglePlayTokenLineage.token */
      INSERT INTO membership_google_play_purchase_tokens (environment, application_id, purchase_token_lookup_sha256, encrypted_purchase_token, membership_provider_lineage_id, linked_purchase_token_lookup_sha256)
      VALUES (${options.environment}, ${options.applicationId}, ${digest}, ${encrypted}, ${lineageId}, ${linkedDigest})
      ON CONFLICT (environment, application_id, purchase_token_lookup_sha256) DO NOTHING RETURNING id`)
    if (index === 0) submittedTokenInserted = insertedToken.length === 1
    // eslint-disable-next-line no-await-in-loop -- validate each alias before the next insertion
    const { rows } = await query<{
      membership_provider_lineage_id: string
    }>(sql`/* persistGooglePlayTokenLineage.lockToken */
      SELECT membership_provider_lineage_id FROM membership_google_play_purchase_tokens WHERE environment = ${options.environment} AND application_id = ${options.applicationId} AND purchase_token_lookup_sha256 = ${digest} FOR KEY SHARE`)
    if (rows[0]?.membership_provider_lineage_id !== lineageId)
      throw new GooglePlayLineageConflictError()
  }
  return { lineageId, submittedTokenInserted }
}
export function tokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
function requiredText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}
