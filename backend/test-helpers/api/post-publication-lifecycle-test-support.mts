import { beginTransaction } from '@voucha/test-helpers'
import { processAuthorDeletionPublicationBatch } from '../../services/post-publication/index.mts'

export async function recordAuthorDeletionWithLockTimeout(userId: string): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(`/* author deletion lock timeout */ SET LOCAL lock_timeout = '50ms'`)
  await processAuthorDeletionPublicationBatch(transaction, userId, null, 100)
  await transaction.commit()
}
