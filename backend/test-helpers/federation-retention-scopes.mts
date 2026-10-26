import type { TransactionQuery } from '@data-stores/psql'
import { getMaximumActivityAgeDays } from '../services/ap-inbox-activities/config.mts'
import { cleanupSweepWithQuery } from '../services/data-retention/cleanup-federation-run.mts'
import {
  cleanupActivityPubReplayPage,
  type ReplayCleanupPage,
} from '../services/data-retention/cleanup-activitypub-replay.mts'
import type { FederationRetentionResult } from '../services/data-retention/cleanup-federation.mts'

/** Only the fixture adapter adds owner predicates; real production SQL executes on PostgreSQL. */
export function scopeFederationRetentionQueryForTest(
  query: TransactionQuery,
  source: 'followers' | 'inbox' | 'outbound',
  ids: readonly string[],
): TransactionQuery {
  const selector =
    source === 'followers'
      ? '/* listFollowerDistributionRetentionCandidates */'
      : '/* listActivityPubReplayRetentionCandidates */'
  const table =
    source === 'followers'
      ? 'follower_distributions'
      : source === 'inbox'
        ? 'activitypub_inbox_activities'
        : 'activitypub_distribution_work_items'
  const id = source === 'outbound' ? 'activity_id' : 'id'
  return new Proxy(query, {
    apply(target, thisArgument, args: Parameters<TransactionQuery>) {
      const [statement, values] = args
      if (typeof statement === 'string' && statement.includes(selector)) {
        if (
          !statement.includes(`FROM ${table}`) ||
          !statement.includes(' ORDER BY') ||
          !statement.includes('LIMIT $2')
        ) {
          throw new Error('Federation retention selector lost its reviewed table/order/limit')
        }
        const where = ` AND ${id} = ANY($3::uuid[]) ORDER BY`
        return Reflect.apply(target, thisArgument, [
          statement.replace(' ORDER BY', where),
          [...(values ?? []), ids],
        ])
      }
      // All writes use only the previously selected capped ids. The floor is rolled back with the fixture transaction.
      return Reflect.apply(target, thisArgument, args)
    },
  })
}

export async function cleanupFollowerRetentionForTest(
  options: {
    batchSize: number
    maxBatches: number
    now?: Date
    scope: { followerDistributionIds: readonly string[] }
  },
  query: TransactionQuery,
) {
  const { scope, ...limits } = options
  return cleanupSweepWithQuery(
    limits,
    scopeFederationRetentionQueryForTest(query, 'followers', scope.followerDistributionIds),
  )
}

/** This owning-fixture orchestration exercises follower cleanup only, never unrelated replay rows. */
export async function cleanupFederationRetentionForTest(options: {
  batchSize: number
  maxBatches: number
  now?: Date
  borrowedQuery: TransactionQuery
  scope: { followerDistributionIds: readonly string[] }
}): Promise<FederationRetentionResult> {
  const { borrowedQuery, ...limits } = options
  const followerDistributions = await cleanupFollowerRetentionForTest(limits, borrowedQuery)
  const empty = (): ReplayCleanupPage => ({
    deleted: 0,
    hasMore: false,
    continuationPosition: null,
  })
  return {
    followerDistributions,
    inboxReplay: empty(),
    outboundReplay: empty(),
    terminalFollowIdentities: { deleted: 0, hasMore: false },
    terminalLikeIdentities: { deleted: 0, hasMore: false },
  }
}

/** Real SQL pages, narrowed to this test's identities and kept in its rollback-only transaction. */
export async function cleanupActivityPubReplayLedgerForTest(
  kind: 'inbox' | 'outbound',
  options: {
    batchSize: number
    maxBatches: number
    now?: Date
    borrowedQuery: TransactionQuery
    scope: { activityIds: readonly string[] }
  },
): Promise<ReplayCleanupPage> {
  const cutoff = new Date(
    (options.now ?? new Date()).getTime() - getMaximumActivityAgeDays() * 86_400_000,
  )
  const query = scopeFederationRetentionQueryForTest(
    options.borrowedQuery,
    kind,
    options.scope.activityIds,
  )
  let deleted = 0
  let page: ReplayCleanupPage = { deleted: 0, hasMore: false, continuationPosition: null }
  for (let batch = 0; batch < options.maxBatches; batch += 1) {
    page = await cleanupActivityPubReplayPage(query, kind, { batchSize: options.batchSize, cutoff })
    deleted += page.deleted
    if (!page.hasMore) break
  }
  return { ...page, deleted }
}
