import type { TransactionQuery } from '@data-stores/psql'
import type { PostPublicationChange } from './types.mts'
import { postPublicationScopeIdentifier, postPublicationScopeLockKey } from './lock.mts'
import {
  PUBLICATION_IDENTITY_BRIDGES,
  retainPublicationIdentityBridges,
  type PublicationIdentityBridgeFamily,
} from './identity-bridges.mts'

/** Declare every identity needed by a multi-capture transaction before its first dirty-work write. */
export async function preparePostPublicationIdentityBridges(
  query: TransactionQuery,
  changes: readonly PostPublicationChange[],
): Promise<void> {
  const locks = [
    ...new Set(changes.map(change => postPublicationScopeLockKey(change.scope))),
  ].sort()
  for (let offset = 0; offset < locks.length; offset += 100) {
    // oxlint-disable-next-line no-await-in-loop -- multi-call transactions prelock their complete declared scope set.
    await query(
      `/* lockPreparedPublicationScopes */ SELECT pg_advisory_xact_lock(hashtextextended(scope, 0))
      FROM unnest($1::text[]) input(scope) ORDER BY scope`,
      [locks.slice(offset, offset + 100)],
    )
  }
  const families = new Map<PublicationIdentityBridgeFamily, Set<string>>()
  const add = (family: PublicationIdentityBridgeFamily, ids: readonly string[]) => {
    const set = families.get(family) ?? new Set<string>()
    for (const id of ids) set.add(id.toLowerCase())
    families.set(family, set)
  }
  for (const change of changes) {
    add(change.scope.type, [postPublicationScopeIdentifier(change.scope)])
    add('post', [
      ...(change.impactedPostIds ?? []),
      ...(change.footprint?.priorRootId ? [change.footprint.priorRootId] : []),
    ])
    add('community', change.impactedCommunityIds ?? [])
    add('rss_feed_item', change.impactedRssFeedItemIds ?? [])
  }
  for (const family of Object.keys(
    PUBLICATION_IDENTITY_BRIDGES,
  ) as PublicationIdentityBridgeFamily[]) {
    const ids = [...(families.get(family) ?? [])].sort()
    for (let offset = 0; offset < ids.length; offset += 100) {
      // oxlint-disable-next-line no-await-in-loop -- first creation follows one global family/native-ID order.
      await retainPublicationIdentityBridges(query, family, ids.slice(offset, offset + 100))
    }
  }
}
