import assert from 'http-assert'
import { enqueueArticleSync } from '@queues/article-sync/enqueues'
import { articleSync } from '@queues/article-sync/queues'
import { recordStaffOperation } from '@services/moderator-actions'
import { assertNotSuspended, isAdminUser } from '@services/users'
import type { PrivateUser } from '@services/users/types'

export async function startAdminArticleSync(currentUser: PrivateUser) {
  assert(isAdminUser(currentUser), 403, 'Administrator role required')
  assertNotSuspended(currentUser)
  const job = await recordStaffOperation(
    currentUser.id,
    { actionType: 'article_sync_run', queueName: articleSync.name },
    async () => {
      const queued = await enqueueArticleSync(currentUser.id)
      assert(queued, 409, 'An article sync was already triggered recently')
      return queued
    },
  )
  return { jobId: job.id }
}

type AdminArticleSyncStatus =
  | { status: 'failed'; error: string }
  | { status: 'completed'; result: unknown }
  | { status: 'active' }

export async function getAdminArticleSyncStatus(
  currentUser: PrivateUser,
  jobId: string,
): Promise<AdminArticleSyncStatus> {
  assert(isAdminUser(currentUser), 403, 'Administrator role required')
  const job = await articleSync.getJob(jobId)
  assert(job, 404, 'Sync job not found')
  if (job.failedReason) return { status: 'failed' as const, error: job.failedReason }
  if (job.finishedOn != null) return { status: 'completed' as const, result: job.returnvalue }
  return { status: 'active' as const }
}
