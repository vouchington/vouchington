import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { ai_agents } from '../queues.mts'
import { enqueueStoryPostAgent } from './story-post.mts'

describe('enqueueStoryPostAgent', () => {
  it('awaits a stable deduplicated story-agent job', async () => {
    const postId = randomUUID()

    await Promise.all([enqueueStoryPostAgent(postId), enqueueStoryPostAgent(postId)])

    const jobs = (await readAllQueueJobs(ai_agents)).filter(
      job => job.name === 'story-post' && (job.data as { post_id?: string }).post_id === postId,
    )
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.data).toEqual({ post_id: postId })
    expect(jobs[0]?.opts).toMatchObject({
      attempts: 3,
      backoff: { delay: 1000, type: 'exponential' },
      priority: 10,
      removeOnComplete: 100,
      removeOnFail: 100,
      deduplication: { id: `story_post_agent_${postId}`, mode: 'simple' },
    })
  })
})
