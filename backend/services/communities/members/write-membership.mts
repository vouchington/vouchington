import {
  beginTransaction,
  registerPostCommitAction,
  withTransactionOptions,
  write,
} from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { SQLStatement } from 'sql-template-strings'
import { invalidateCommunityMembershipCaches } from '@services/entity-cache/community-memberships'

type MembershipCacheScope = { userIds: readonly string[]; communityIds: readonly string[] }

/** Every membership mutation clears both membership caches after its owning transaction commits. */
export async function writeCommunityMembershipMutation<
  Row extends Record<string, unknown> = Record<string, unknown>,
>(
  statement: SQLStatement,
  scope: MembershipCacheScope | ((rows: Row[]) => MembershipCacheScope),
  options: QueryOptions = {},
): Promise<Awaited<ReturnType<typeof write<Row>>>> {
  if (!options.query && !options.client) {
    await using query = await beginTransaction()
    const result = await writeCommunityMembershipMutation<Row>(statement, scope, { query })
    await query.commit()
    return result
  }
  return withTransactionOptions(options, async query => {
    // no-mistakes-disable-next-line postgres-require-query-annotation: the forwarded statement keeps its caller's query annotation, which the PostgreSQL executor validates at runtime
    const result = await write<Row>(statement, { query })
    const { userIds, communityIds } = typeof scope === 'function' ? scope(result.rows) : scope
    registerPostCommitAction(query, () =>
      invalidateCommunityMembershipCaches(userIds, communityIds),
    )
    return result
  })
}
