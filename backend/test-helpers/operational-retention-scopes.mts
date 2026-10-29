import type { TransactionQuery } from '@data-stores/psql'
import type { OperationalTombstonePageResult } from '../services/data-retention/cleanup-operational-tombstone-types.mts'
import { cleanupOperationalTombstonePage } from '../services/data-retention/cleanup-operational-tombstones.mts'
import {
  PLANS,
  type Family,
} from '../services/data-retention/cleanup-operational-tombstone-plans.mts'

/** Add only an exact owned-ID predicate before the real bounded physical candidate SELECT. */
export function scopeOperationalRetentionQuery(
  query: TransactionQuery,
  family: Family,
  ids: readonly string[],
) {
  const conversation = family === 'deleted_conversations'
  const marker = conversation
    ? 'listDeletedConversationRetentionCandidate'
    : 'listOperationalTombstoneCandidates'
  const from = conversation
    ? 'FROM conversations conversation'
    : `FROM ${PLANS[family].table} source`
  const alias = conversation ? 'conversation' : 'source'
  return new Proxy(query, {
    apply(target, thisArgument, args: Parameters<TransactionQuery>) {
      const [statement, values] = args
      if (typeof statement === 'string' && statement.includes(`/* ${marker} */`)) {
        if (
          !statement.includes(from) ||
          !statement.includes(' ORDER BY') ||
          !statement.includes('LIMIT ')
        ) {
          throw new Error('Operational candidate selector lost its reviewed source/order/limit')
        }
        const parameters = [...(values ?? []), ids]
        return Reflect.apply(target, thisArgument, [
          statement.replace(
            ' ORDER BY',
            ` AND ${alias}.id = ANY($${parameters.length}::uuid[]) ORDER BY`,
          ),
          parameters,
        ])
      }
      // Mutations use only capped candidate IDs or the fixed cursor row; the caller owns commit or rollback.
      return Reflect.apply(target, thisArgument, args)
    },
  })
}

/** Fixture orchestration owns its rollback transaction; every count/result comes from the real SQL page. */
export async function cleanupOperationalTombstonesForTest(
  family: Family,
  options: {
    borrowedQuery: TransactionQuery
    ids: readonly string[]
    batchSize: number
    maxBatches: number
    now?: Date
  },
) {
  const query = scopeOperationalRetentionQuery(options.borrowedQuery, family, options.ids)
  let deleted = 0
  let last: OperationalTombstonePageResult = {
    deleted: 0,
    hasMore: false,
    continuation: null,
    stalled: false,
  }
  for (let batch = 0; batch < options.maxBatches; batch += 1) {
    last = await cleanupOperationalTombstonePage(query, family, options.batchSize, {
      now: options.now,
    })
    deleted += last.deleted
    if (!last.hasMore || last.stalled) break
  }
  return { deleted, hasMore: last.hasMore, continuation: last.continuation }
}

/** One same-service page for independent-connection row-lock regressions. */
export function cleanupOperationalTombstonePageForTest(
  family: Family,
  options: {
    borrowedQuery: TransactionQuery
    ids: readonly string[]
    batchSize: number
    now?: Date
  },
) {
  return cleanupOperationalTombstonePage(
    scopeOperationalRetentionQuery(options.borrowedQuery, family, options.ids),
    family,
    options.batchSize,
    { now: options.now },
  )
}
