import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getKnownGooglePlayCanonicalRoot } from './canonical-root.mts'
import { tokenDigest } from './token-digest.mts'
import { ensureGooglePlayTokenAlias, GooglePlayLineageConflictError } from './token-alias.mts'
export { tokenDigest } from './token-digest.mts'
export { GooglePlayLineageConflictError } from './token-alias.mts'
export { getLatestKnownGooglePlayPurchaseToken } from './known-lineage.mts'
import { fetchGooglePlaySubscription } from './subscription-fetch.mts'
import { GooglePlaySubscriptionLookupError } from './configured-client.mts'
import type { GooglePlaySubscriptionV2, GooglePlaySubscriptionsV2Client } from './types.mts'
import { getOrCreateProviderContextId } from '../provider-context.mts'

const MAX_LINKED_TOKEN_DEPTH = 100
export type GooglePlayResolvedLineage = {
  rootToken: string
  rootDigest: string
  currentSubscription: GooglePlaySubscriptionV2
  tokens: Array<{ token: string; linkedToken: string | null; fetched: boolean }>
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
  const tokens: GooglePlayResolvedLineage['tokens'] = []
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
    } catch (err) {
      if (
        depth > 0 &&
        err instanceof GooglePlaySubscriptionLookupError &&
        (err.status === 404 ||
          err.status === 410 ||
          (err.status === 400 && err.reason === 'subscriptionExpired'))
      ) {
        tokens.push({ token, linkedToken: null, fetched: false })
        return {
          rootToken: token,
          rootDigest: digest,
          currentSubscription: currentSubscription!,
          tokens,
        }
      }
      throw err
    }
    currentSubscription ??= subscription
    if (depth === 0) {
      // eslint-disable-next-line no-await-in-loop -- this lookup follows the current token fetch
      const knownRoot = await getKnownGooglePlayCanonicalRoot(environment, applicationId, digest)
      if (knownRoot) {
        tokens.push({
          token,
          linkedToken: requiredText(subscription.linkedPurchaseToken),
          fetched: true,
        })
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
      tokens.push({ token, linkedToken: expiredToken, fetched: true })
      return {
        rootToken: knownRoot ? expiredToken : token,
        rootDigest: knownRoot ?? digest,
        currentSubscription,
        tokens,
      }
    }
    const linkedToken = requiredText(subscription.linkedPurchaseToken)
    tokens.push({ token, linkedToken, fetched: true })
    if (!linkedToken) return { rootToken: token, rootDigest: digest, currentSubscription, tokens }
    token = linkedToken
  }
  throw new Error(`Google Play linked purchase-token chain exceeded ${MAX_LINKED_TOKEN_DEPTH}`)
}
/** A delayed RTDN for an ancestor must recheck the newest persisted successor, not reproject stale state. */
export async function persistGooglePlayTokenLineage(
  options: {
    environment: 'test' | 'production'
    applicationId: string
    resolved: GooglePlayResolvedLineage
  },
  query: QueryExecutor,
): Promise<{ lineageId: string; submittedTokenFirstFetched: boolean }> {
  const contextId = await getOrCreateProviderContextId(
    {
      provider: 'google_play',
      environment: options.environment,
      applicationId: options.applicationId,
    },
    query,
  )
  const { rows: inserted } = await query<{
    id: string
  }>(sql`/* persistGooglePlayTokenLineage.lineage */
    INSERT INTO membership_provider_lineages (membership_provider_context_id, provider_lineage_id)
    VALUES (${contextId}, ${options.resolved.rootDigest})
    ON CONFLICT (membership_provider_context_id, provider_lineage_id) DO NOTHING RETURNING id`)
  const lineageId =
    inserted[0]?.id ??
    (
      await query<{ id: string }>(sql`/* persistGooglePlayTokenLineage.existingLineage */
    SELECT id FROM membership_provider_lineages WHERE membership_provider_context_id = ${contextId} AND provider_lineage_id = ${options.resolved.rootDigest} FOR UPDATE`)
    ).rows[0]?.id
  if (!lineageId) throw new Error('Google Play canonical lineage was not returned')
  let submittedTokenFirstFetched = false
  for (let index = options.resolved.tokens.length - 1; index >= 0; index--) {
    const item = options.resolved.tokens[index]!
    let predecessor = null
    if (item.linkedToken) {
      // eslint-disable-next-line no-await-in-loop -- predecessor must exist before its successor FK
      predecessor = await ensureGooglePlayTokenAlias(item.linkedToken, contextId, lineageId, query)
    }
    // eslint-disable-next-line no-await-in-loop -- aliases share a locked canonical lineage
    const alias = await ensureGooglePlayTokenAlias(item.token, contextId, lineageId, query)
    if (index === 0) submittedTokenFirstFetched = item.fetched && alias.fetchedAt === null
    if (!item.fetched) continue
    // A reported-only alias becomes fetched on the same row; the successor FK never changes.
    // eslint-disable-next-line no-await-in-loop -- the canonical lineage lock serializes this update
    const { rows } = await query<{ id: string }>(sql`/* persistGooglePlayTokenLineage.markFetched */
      UPDATE membership_google_play_purchase_tokens
      SET fetched_at = COALESCE(fetched_at, CURRENT_TIMESTAMP),
        linked_purchase_token_id = COALESCE(linked_purchase_token_id, ${predecessor?.id ?? null})
      WHERE id = ${alias.id}
        AND (${predecessor?.id ?? null}::UUID IS NULL OR linked_purchase_token_id IS NULL OR linked_purchase_token_id = ${predecessor?.id ?? null})
      RETURNING id`)
    if (!rows[0]) throw new GooglePlayLineageConflictError()
  }
  return { lineageId, submittedTokenFirstFetched }
}

function requiredText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}
