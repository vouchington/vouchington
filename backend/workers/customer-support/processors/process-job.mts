import { handleBedrockRateLimit, UnrecoverableError } from '@modules/queue-errors'
import { upsertSupportMessageEmbedding } from '@services/bedrock-embeddings'
import { getSupportMessageById } from '@services/customer-support'
import type { Job, Worker } from 'glide-mq'

type EmbedSupportMessageData = { threadId: string; messageId: string }
export type CustomerSupportJobData = EmbedSupportMessageData
export type CustomerSupportWorker = Pick<Worker, 'rateLimit'>

export async function processCustomerSupportJob(
  job: Job<CustomerSupportJobData>,
  worker: CustomerSupportWorker,
): Promise<{ success: true } | null> {
  try {
    switch (job.name) {
      case 'embedSupportMessage': {
        const { threadId, messageId } = job.data || {}
        if (!threadId || !messageId) {
          throw new UnrecoverableError('embedSupportMessage job requires threadId and messageId')
        }
        const message = await getSupportMessageById(threadId, messageId)
        if (!message) return null
        await upsertSupportMessageEmbedding(message)
        return { success: true }
      }
      default:
        throw new UnrecoverableError(`Unknown job type: ${job.name}`)
    }
  } catch (error) {
    return await handleBedrockRateLimit(error, worker)
  }
}
