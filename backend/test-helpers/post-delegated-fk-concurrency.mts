import { onTestFinished } from 'vitest'
import { lockImageDeliveryMutation } from '../services/media-delivery-safety/delivery-lock.mts'
import { lockPostPublication } from '../services/post-publication/lock.mts'
import sql from 'sql-template-strings'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { beginTransaction } from '@data-stores/psql'
import { lockDelegatedPostThread } from '../services/posts/delegated-write-locks.mts'

/** Keep delegated fences held while a separate connection performs ordinary FK-backed writes. */
export async function withHeldDelegatedThreadFenceForTest<Result>(
  postId: string,
  actorId: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  await using query = await beginTransaction()
  await lockDelegatedPostThread(query, postId, actorId)
  const pending = operation()
  void pending.catch(() => undefined)
  let cleanup: Promise<void> | undefined
  const releaseAndDrain = () => {
    cleanup ??= query.rollback().finally(async () => {
      await pending.catch(() => undefined)
    })
    return cleanup
  }
  onTestFinished(releaseAndDrain)
  try {
    return await pending
  } finally {
    await releaseAndDrain()
  }
}

/** Reproduce delete's media→publication order while a delegated reply waits on shared media. */
export async function withConcurrentMediaThenPublicationFenceForTest<Result>(
  postId: string,
  imageId: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  await using query = await beginTransaction()
  await lockImageDeliveryMutation(query, { postIds: [postId], imageIds: [imageId] })
  const { rows: placements } = await query<{ placement_id: string }>(sql`
    /* withConcurrentMediaThenPublicationFenceForTest:placement */
    SELECT placement_id FROM image_placements WHERE post_id = ${postId} AND image_id = ${imageId}
  `)
  if (placements.length !== 1 || !placements[0])
    throw new Error('Media-delivery fixture did not resolve one held placement')
  const processId = await getTestPostgresBackendProcessId(query)
  return await withTestOwnedPostgresWait(
    {
      holderProcessId: processId,
      pool: 'write',
      lock: { kind: 'advisory', key: `image-placement:${placements[0].placement_id}` },
      queryMarker: 'lockImageDeliveryMutation:advisory',
      releaseHolder: () => query[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const pending = operation()
      await waitForLock(pending)
      await query(
        sql`/* withConcurrentMediaThenPublicationFenceForTest:lockTimeout */ SET LOCAL lock_timeout = '2s'`,
      )
      await lockPostPublication(query, postId)
      await query.rollback()
      return pending
    },
  )
}
