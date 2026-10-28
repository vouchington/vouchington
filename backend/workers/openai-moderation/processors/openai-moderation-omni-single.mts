import {
  type PostModerationReconciliationData,
  OPENAI_MODERATION_BACKFILL_IMAGES_JOB,
  OPENAI_MODERATION_BACKFILL_POSTS_JOB,
  OPENAI_MODERATION_IMAGE_JOB,
  OPENAI_MODERATION_POST_JOB,
  OPENAI_MODERATION_RECONCILE_IMAGE_QUARANTINES_JOB,
  OPENAI_MODERATION_RECONCILE_POST_MODERATION_JOB,
} from '@queues/background/enqueues/openai-moderation-jobs'
import {
  upsertPostOpenAIModeration,
  upsertImageOpenAIModeration,
  markPostOpenAIModerationNoContent,
  listUnmoderatedPostIdPage,
  listUnmoderatedImageIdPage,
  type BackfillIdPage,
  reconcilePendingImageQuarantines,
} from '@services/openai-moderation'
import { getPostByAny } from '@services/posts/get'
import type { Job } from 'glide-mq'
import { handleOpenAIRateLimit } from '@modules/openai-utils/rate-limit'
import {
  checkPostClearance,
  commitCurrentPostModerationVersions,
  enqueuePostModerationRecovery,
  readCurrentAutomatedPostModerationAttempt,
  reconcilePostModerationWork,
} from '@services/post-clearance'
import { enqueueReconcilePostNotifications } from '@queues/notifications/enqueues'
import {
  enqueueReconcilePostModerationContinuation,
  enqueueBackfillImageModerationContinuation,
  enqueueBackfillPostModerationContinuation,
  enqueueCreateImageModerationBatch,
} from '@queues/openai-moderation/enqueues'

type OpenAIModerationJobData = {
  id?: string
  versionId?: string
  afterId?: string
} & PostModerationReconciliationData

export async function handleOpenAIModerationOmniSingleJob(
  job: Job<OpenAIModerationJobData>,
  scope?: { postIds?: readonly string[] },
): Promise<unknown> {
  try {
    switch (job.name) {
      case OPENAI_MODERATION_POST_JOB.name:
        return await moderatePostVersion(job.data.versionId)
      case OPENAI_MODERATION_IMAGE_JOB.name: {
        if (!job.data.id) throw new Error('Image job requires id in job.data')
        const result = await upsertImageOpenAIModeration(job.data.id)
        return { success: true, ...result }
      }
      case OPENAI_MODERATION_BACKFILL_POSTS_JOB.name:
        return await runBackfillPage(job.data.afterId, {
          listPage: listUnmoderatedPostIdPage,
          enqueueBatch: enqueueUnmoderatedPostModeration,
          enqueueContinuation: enqueueBackfillPostModerationContinuation,
        })
      case OPENAI_MODERATION_BACKFILL_IMAGES_JOB.name:
        return await runBackfillPage(job.data.afterId, {
          listPage: listUnmoderatedImageIdPage,
          enqueueBatch: enqueueCreateImageModerationBatch,
          enqueueContinuation: enqueueBackfillImageModerationContinuation,
        })
      case OPENAI_MODERATION_RECONCILE_IMAGE_QUARANTINES_JOB.name:
        return await reconcilePendingImageQuarantines()
      case OPENAI_MODERATION_RECONCILE_POST_MODERATION_JOB.name: {
        const postIds = scope?.postIds ?? job.data.postIds
        const reconciliation = await reconcilePostModerationWork(
          undefined,
          postIds,
          job.data.cursor,
        )
        await Promise.all([
          ...reconciliation.due.map(row =>
            enqueuePostModerationRecovery(row.version_id, row.source),
          ),
          ...reconciliation.exhausted_post_ids.map(checkPostClearance),
        ])
        if (reconciliation.nextCursor)
          await enqueueReconcilePostModerationContinuation(reconciliation.nextCursor, postIds)
        return {
          hasMore: reconciliation.hasMore,
          enqueued: reconciliation.due.length,
          moved_to_review: reconciliation.exhausted_post_ids.length,
        }
      }
      default:
        throw new Error(`Unknown job type: ${job.name}`)
    }
  } catch (err: unknown) {
    return handleOpenAIRateLimit(err)
  }
}

async function moderatePostVersion(versionId: string | undefined): Promise<unknown> {
  if (!versionId) throw new Error('Post job requires versionId in job.data')
  const attempt = await readCurrentAutomatedPostModerationAttempt(versionId, 'openai_omni')
  if (!attempt) return { success: true, applied: false }
  const post = await getPostByAny(attempt.post_id, { readOnly: false })
  if (!post) return { success: true, applied: false }
  const result = await upsertPostOpenAIModeration(post, { readOnly: false, attempt })
  if (result.skipped && result.reason === 'content_changed') {
    return { success: true, applied: false }
  }
  await enqueueReconcilePostNotifications(post.id, attempt.id)
  /* v8 ignore start -- valid post rows require text content; service-level tests cover direct no-content handling */
  if (result.skipped && result.reason === 'no_content_to_moderate') {
    await markPostOpenAIModerationNoContent(post.id, attempt)
  }
  /* v8 ignore stop */
  await checkPostClearance(post.id)
  return { success: true }
}

async function enqueueUnmoderatedPostModeration(postIds: readonly string[]): Promise<void> {
  const versions = await commitCurrentPostModerationVersions(postIds)
  await Promise.all(
    versions.map(version => enqueuePostModerationRecovery(version.id, 'openai_omni')),
  )
}

// One bounded page per dispatcher run. The continuation ranks behind the moderation jobs this page
// just enqueued, so no more than one page of them ever waits.
async function runBackfillPage(
  afterId: string | undefined,
  page: {
    listPage: (afterId?: string) => Promise<BackfillIdPage>
    enqueueBatch: (ids: string[]) => Promise<unknown>
    enqueueContinuation: (afterId: string) => Promise<unknown>
  },
): Promise<{ enqueued: number; hasMore: boolean }> {
  const { ids, hasMore } = await page.listPage(afterId)
  await page.enqueueBatch(ids)
  if (hasMore) await page.enqueueContinuation(ids.at(-1)!)
  return { enqueued: ids.length, hasMore }
}
