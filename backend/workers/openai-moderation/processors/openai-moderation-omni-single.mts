import type { OpenAIModerationOmniSingleJob } from '@queues/openai-moderation/types'
import {
  upsertPostOpenAIModeration,
  upsertImageOpenAIModeration,
  markPostOpenAIModerationNoContent,
  streamUnmoderatedPostIdBatches,
  streamUnmoderatedImageIdBatches,
} from '@services/openai-moderation'
import { getPostByAny } from '@services/posts/get'
import { Worker, type Job } from 'glide-mq'
import { handleOpenAIRateLimit } from '@modules/openai-utils/rate-limit'
import { checkPostClearance } from '@services/post-clearance'
import { enqueueReconcilePostNotifications } from '@queues/notifications/enqueues'
import {
  enqueueCreatePostModerationBatch,
  enqueueCreateImageModerationBatch,
} from '@queues/openai-moderation/enqueues'

type OpenAIModerationJobData = { id: string }

export async function handleOpenAIModerationOmniSingleJob(
  job: Job<OpenAIModerationJobData>,
  worker: Worker,
): Promise<unknown> {
  try {
    switch (job.name as OpenAIModerationOmniSingleJob) {
      case 'post': {
        if (!job.data.id) throw new Error('Post job requires id in job.data')
        const post = await getPostByAny(job.data.id, { readOnly: false })
        if (!post) return null
        const result = await upsertPostOpenAIModeration(post, { readOnly: false })
        await enqueueReconcilePostNotifications(post.id)

        // Check clearance gate after moderation completes (enqueuePostModerationAgents is called inside on approval)
        if (result.skipped) {
          /* v8 ignore start -- valid post rows require text content; service-level tests cover direct no-content handling */
          if (result.reason === 'no_content_to_moderate') {
            // No content to moderate — mark as done so the clearance gate can proceed
            await markPostOpenAIModerationNoContent(post.id)
            await checkPostClearance(post.id)
          }
          /* v8 ignore stop */
          // content_changed: skip — next moderation job (triggered by entity listener update) will handle it
        } else {
          await checkPostClearance(post.id)
        }

        return { success: true }
      }
      case 'image': {
        if (!job.data.id) throw new Error('Image job requires id in job.data')
        const result = await upsertImageOpenAIModeration(job.data.id)
        return { success: true, ...result }
      }
      case 'backfill_posts': {
        let enqueued = 0
        // Stream IDs over a single pg-cursor and bulk-enqueue one addBulk per batch.
        for await (const ids of streamUnmoderatedPostIdBatches()) {
          await enqueueCreatePostModerationBatch(ids)
          enqueued += ids.length
        }
        return { enqueued }
      }
      case 'backfill_images': {
        let enqueued = 0
        for await (const ids of streamUnmoderatedImageIdBatches()) {
          await enqueueCreateImageModerationBatch(ids)
          enqueued += ids.length
        }
        return { enqueued }
      }
      default:
        throw new Error(`Unknown job type: ${job.name}`)
    }
  } catch (error: unknown) {
    return await handleOpenAIRateLimit(error, worker)
  }
}
