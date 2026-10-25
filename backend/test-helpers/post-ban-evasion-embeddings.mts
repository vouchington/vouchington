import { MODERATION_SIGNALS_BAN_EVASION_JOB } from '@queues/background/enqueues/moderation-signals-jobs'
import { moderationSignalsQueue } from '../queues/moderation-signals/queues.mts'
import { randomBytes, randomUUID } from 'node:crypto'
import { beginTransaction, writePool, type TransactionQuery } from '@data-stores/psql'
import { createTestUser } from './entities/users.mts'
import { insertTestCommunity } from './entities/communities.mts'
import { insertTestPost } from './entities/posts.mts'
import { setPostEmbeddingContentOnlySha256, makeRandomEmbedding } from './entities/embeddings.mts'
import { updatePostEmbeddingData } from './entities/posts-embeddings.mts'
import { createTestUuidWindow } from './uuid-window.mts'
import { processAuthorDeletionPublicationBatch } from '../services/post-publication/capture-author-deletion-batch.mts'
import { rearmNextPostBanEvasionEmbedding } from '../services/posts/ban-evasion-embeddings.mts'
import { observeTestTransactionLockNotice } from './postgres-advisory-lock-notice.mts'

export async function createTestBanEvasionEmbeddingChain() {
  const author = await createTestUser()
  const community = await insertTestCommunity({ createdById: author.id, visibility: 'public' })
  const window = createTestUuidWindow()
  const ids = [window.firstId, window.secondId, window.thirdId]
  const hashes = ids.map(() => randomBytes(32))
  await Promise.all(
    ids.map(async (id, index) => {
      await insertTestPost({
        id,
        title: 'Ban evasion embedding recovery',
        slug: `embedding-recovery-${randomUUID()}`,
        markdown: 'Recovery fixture',
        createdById: author.id,
        communityId: community.id,
        postType: 'article',
      })
      const inputSha256 = hashes[index]!
      await setPostEmbeddingContentOnlySha256(id, inputSha256)
      await updatePostEmbeddingData({
        postId: id,
        inputSha256,
        embedding: makeRandomEmbedding(),
        tokens: 1,
      })
    }),
  )
  return {
    author,
    firstId: window.firstId,
    skipped: ids.slice(1).map((id, index) => ({
      id,
      first_post_id: window.firstId,
      created_by_id: author.id,
      community_id: community.id,
      input_sha256: hashes[index + 1]!,
    })),
  }
}

export async function anonymizeTestAuthorPostBatch(authorId: string, username: string) {
  await using transaction = await beginTransaction()
  const result = await processAuthorDeletionPublicationBatch(transaction, authorId, username, 1)
  await transaction.commit()
  return result
}

/** Proves the deletion UPDATE is blocked by the marker transaction before releasing that marker. */
export async function deleteTestPostAfterBanEvasionMarkerWait(
  holder: TransactionQuery,
  postId: string,
  releaseHolder: () => Promise<void>,
) {
  const { rows } = await holder<{ transaction_id: string; process_id: number }>(
    '/* banEvasionMarkerLockIdentity */ SELECT pg_current_xact_id()::text AS transaction_id, pg_backend_pid() AS process_id',
  )
  const identity = rows[0]!
  const client = await writePool.connect()
  const observer = observeTestTransactionLockNotice(client, identity.transaction_id)
  let released: Promise<void> | undefined
  const release = () => (released ??= releaseHolder())
  let completed: Promise<void> | undefined
  const errors: unknown[] = []
  try {
    const waiter = await observer.ready
    completed = (async () => {
      await using transaction = await beginTransaction({ client })
      await transaction(
        '/* startTestBanEvasionPostDeletion */ UPDATE posts SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
        [postId],
      )
      await rearmNextPostBanEvasionEmbedding(transaction, postId)
      await transaction.commit()
    })()
    const settled = Promise.allSettled([completed])
    await observer.wait(settled)
    await holder('/* banEvasionMarkerClearActivitySnapshot */ SELECT pg_stat_clear_snapshot()')
    const { rows: proof } = await holder<{ waiting: boolean }>(
      `/* banEvasionMarkerDeletionWaitProof */
        SELECT EXISTS (
          SELECT 1 FROM pg_locks queued
          WHERE queued.pid = $1 AND queued.locktype = 'transactionid'
            AND queued.transactionid::text = $2 AND queued.mode = 'ShareLock'
            AND NOT queued.granted
            AND $3 = ANY(pg_blocking_pids(queued.pid))
        ) AS waiting`,
      [waiter.processId, identity.transaction_id, identity.process_id],
    )
    if (!proof[0]?.waiting) throw new Error('Deletion did not retain the exact marker row blocker')
    await release()
    await completed
  } catch (err) {
    errors.push(err)
  } finally {
    try {
      await release()
    } catch (err) {
      errors.push(err)
    }
    if (completed) {
      const [result] = await Promise.allSettled([completed])
      if (result?.status === 'rejected') errors.push(result.reason)
    }
    let destroy = false
    try {
      await observer.close()
    } catch (err) {
      destroy = true
      errors.push(err)
    } finally {
      client.release(destroy)
    }
  }
  if (errors.length > 0)
    throw new AggregateError([...new Set(errors)], 'Marker/deletion lock proof failed')
}

export async function getTestBanEvasionJobsFor(communityId: string, userId: string) {
  const jobs = (
    await Promise.all([
      moderationSignalsQueue.getJobs('waiting'),
      moderationSignalsQueue.getJobs('active'),
      moderationSignalsQueue.getJobs('completed'),
      moderationSignalsQueue.getJobs('failed'),
      moderationSignalsQueue.getJobs('delayed'),
    ])
  ).flat()
  return jobs.filter(job => {
    if (job.name !== MODERATION_SIGNALS_BAN_EVASION_JOB.name) return false
    const data = job.data as { communityId?: string; userId?: string }
    return data.communityId === communityId && data.userId === userId
  })
}
