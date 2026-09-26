import type { TransactionQuery } from '@data-stores/psql'
import { lockPostPublicationScope } from './lock.mts'
import { upsertPostPublicationDirtyWork } from './upsert-dirty-work.mts'

/** Audit does not mutate disappearing sources; defer exact retention to resumable worker stages. */
export async function recordPostPublicationShadowRepair(
  query: TransactionQuery,
  postId: string,
): Promise<void> {
  await lockPostPublicationScope(query, { type: 'post', postId })
  await upsertPostPublicationDirtyWork(query, 'post', [postId], ['post_updated'])
}
