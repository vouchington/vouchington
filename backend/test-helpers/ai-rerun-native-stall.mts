import type { Queue } from 'glide-mq'
import { workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { AI_AGENTS_QUEUE_NAME } from '../queues/ai-agents/config.mts'

/** Recreate the exhausted native stall count before recovery reclaims owned jobs. */
export async function primeOwnedAIAgentNativeStalls(
  queue: Queue,
  jobIds: readonly string[],
): Promise<void> {
  const client = await queue.getClient()
  for (const id of jobIds) {
    await client.hset(`${workerQueuePrefix}:{${AI_AGENTS_QUEUE_NAME}}:job:${id}`, {
      stalledCount: '2',
    })
  }
}
