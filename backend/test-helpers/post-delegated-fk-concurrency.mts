import { onTestFinished } from 'vitest'
import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { lockImageDeliveryMutation } from '../services/media-delivery-safety/delivery-lock.mts'
import { lockPostPublication } from '../services/post-publication/lock.mts'
import sql from 'sql-template-strings'
import {
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from './postgres-lock-wait.mts'
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
  const processId = await getTestPostgresBackendProcessId(query)
  const pending = operation()
  void pending.catch(() => undefined)
  try {
    await waitForTestPostgresLockWaiter(processId, 'lockImageDeliveryMutation:advisory')
    await query(allowUnannotatedQuery(sql`SET LOCAL lock_timeout = '2s'`))
    await lockPostPublication(query, postId)
    await query.rollback()
  } catch (err) {
    await query.rollback()
    await pending.catch(() => undefined)
    throw err
  }
  return await pending
}
