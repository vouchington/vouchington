import { beginTransaction } from '@voucha/test-helpers'
import {
  lockAuthorPublicationLifecycle,
  processAuthorDeletionPublicationBatch,
} from '../../services/post-publication/index.mts'

export async function recordAuthorDeletionWithLockTimeout(userId: string): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(`/* author deletion lock timeout */ SET LOCAL lock_timeout = '50ms'`)
  await processAuthorDeletionPublicationBatch(transaction, userId, null, 100)
  await transaction.commit()
}

export async function holdAuthorPublicationLifecycleLock(
  userId: string,
  ready: () => void,
  release: Promise<void>,
): Promise<void> {
  await using transaction = await beginTransaction()
  await lockAuthorPublicationLifecycle(transaction, userId)
  ready()
  await release
  await transaction.commit()
}

export async function acquirePublicationLifecycleLockWithTimeout(
  type: 'author' | 'rss-feed',
  id: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    `/* postPublication${type === 'author' ? 'Author' : 'Rss'}LockTimeout */ SET LOCAL lock_timeout = '50ms'`,
  )
  if (type === 'author') await lockAuthorPublicationLifecycle(transaction, id)
  else
    await transaction(
      `/* postPublicationRssLock */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [id],
    )
  await transaction.commit()
}
