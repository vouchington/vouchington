import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { enqueueCreatePostModeration } from './enqueues.mts'
import { openai_moderation_omni_single } from './queues.mts'

describe('enqueueCreatePostModeration', () => {
  beforeEach(async () => {
    await openai_moderation_omni_single.obliterate({ force: true })
  })

  it('includes the replacement key in the post moderation deduplication id', async () => {
    const postId = randomUUID()
    const deduplicationKey = `${'a'.repeat(64)}_123`

    await enqueueCreatePostModeration(postId, { deduplicationKey })

    const waiting = await openai_moderation_omni_single.getJobs('waiting')
    const job = waiting.find(
      item => item.name === 'post' && (item.data as { id?: string }).id === postId,
    )
    expect(job).toBeDefined()
    expect(job!.opts).toMatchObject({
      priority: 10,
      deduplication: {
        id: `post_moderation_${postId}_${deduplicationKey}`,
        mode: 'debounce',
      },
    })
  })
})
