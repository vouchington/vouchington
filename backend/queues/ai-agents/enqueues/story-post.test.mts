import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { ai_agents } from '../queues.mts'
import { enqueueBulkStoryPostAgents, enqueueStoryPostAgent } from './story-post.mts'

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
      removeOnFail: true,
      deduplication: { id: `story_post_agent_${postId}`, mode: 'simple' },
    })
  })

  it('adds one forced job per post in a single call, each with its own refresh dedup id', async () => {
    const postIds: string[] = [randomUUID(), randomUUID()]

    await enqueueBulkStoryPostAgents(postIds, { force: true })

    const jobs = (await readAllQueueJobs(ai_agents)).filter(
      job =>
        job.name === 'story-post' && postIds.includes((job.data as { post_id: string }).post_id),
    )
    expect(jobs.map(job => (job.data as { post_id: string }).post_id).toSorted()).toEqual(
      postIds.toSorted(),
    )
    for (const job of jobs) {
      const postId = (job.data as { post_id: string }).post_id
      expect(job.data).toEqual({ post_id: postId, force: true })
      expect(job.opts.deduplication?.id).toMatch(
        new RegExp(`^story_post_agent_refresh_${postId}_[0-9a-f-]{36}$`),
      )
    }
  })

  it('adds nothing for an empty list', async () => {
    await expect(enqueueBulkStoryPostAgents([])).resolves.toEqual([])
  })
})
