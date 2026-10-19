import type { TransactionQuery } from '@data-stores/psql'
import {
  POST_PUBLICATION_REASONS,
  type PostPublicationChange,
  type PostPublicationDirtyWork,
} from './types.mts'
import { postPublicationScopeIdentifier } from './lock.mts'
import { retainRecordedPublicationKeys } from './capture-keys.mts'
import { upsertPostPublicationDirtyWork } from './upsert-dirty-work.mts'
import { preparePostPublicationIdentityBridges } from './prepare-identity-bridges.mts'

const reasons = new Set<string>(POST_PUBLICATION_REASONS)

export async function recordPostPublicationChange(
  query: TransactionQuery,
  change: PostPublicationChange,
): Promise<PostPublicationDirtyWork> {
  assertChange(change)
  const work = await prepareAndUpsertPostPublicationChange(query, change)
  await retainRecordedPublicationKeys(query, work.id, change)
  return work
}

async function prepareAndUpsertPostPublicationChange(
  query: TransactionQuery,
  change: PostPublicationChange,
): Promise<PostPublicationDirtyWork> {
  await preparePostPublicationIdentityBridges(query, [change])
  const [work] = await upsertPostPublicationDirtyWork(
    query,
    change.scope.type,
    [postPublicationScopeIdentifier(change.scope)],
    [change.reason],
  )
  if (!work) throw new Error('Post publication dirty work upsert returned no row')
  return work
}

function assertChange(change: PostPublicationChange): void {
  if (!reasons.has(change.reason))
    throw new TypeError(`Unsupported post publication reason: ${change.reason}`)
  const id = postPublicationScopeIdentifier(change.scope)
  if (typeof id !== 'string' || id.length === 0)
    throw new TypeError('Post publication scope requires an identifier')
}
