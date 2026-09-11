import type { TransactionQuery } from '@data-stores/psql'
import {
  POST_PUBLICATION_REASONS,
  type PostPublicationChange,
  type PostPublicationDirtyWork,
} from './types.mts'
import { lockPostPublicationScope, postPublicationScopeIdentifier } from './lock.mts'
import {
  retainCurrentPostPublicationKeys,
  retainPostPublicationFootprintKeys,
  retainPostPublicationImpactKeys,
} from './capture-keys.mts'
import { upsertPostPublicationDirtyWork } from './upsert-dirty-work.mts'

const reasons = new Set<string>(POST_PUBLICATION_REASONS)

export async function recordPostPublicationChange(
  query: TransactionQuery,
  change: PostPublicationChange,
): Promise<PostPublicationDirtyWork> {
  assertChange(change)
  await lockPostPublicationScope(query, change.scope)
  const [work] = await upsertPostPublicationDirtyWork(
    query,
    change.scope.type,
    [postPublicationScopeIdentifier(change.scope)],
    [change.reason],
  )
  if (!work) throw new Error('Post publication dirty work upsert returned no row')
  // ast-grep-ignore: no-three-sequential-awaits -- all retained keys must commit with the dirty generation.
  await retainPostPublicationImpactKeys(query, work.id, {
    postIds: change.impactedPostIds,
    topicIds: change.impactedTopicIds,
    communityIds: change.impactedCommunityIds,
    rssFeedItemIds: change.impactedRssFeedItemIds,
  })
  await retainPostPublicationFootprintKeys(query, work.id, change.footprint)
  await retainCurrentPostPublicationKeys(query, work.id, change.scope)
  return work
}

function assertChange(change: PostPublicationChange): void {
  if (!reasons.has(change.reason))
    throw new TypeError(`Unsupported post publication reason: ${change.reason}`)
  const id = postPublicationScopeIdentifier(change.scope)
  if (typeof id !== 'string' || id.length === 0)
    throw new TypeError('Post publication scope requires an identifier')
}
