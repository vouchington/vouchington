import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestPost, readAllQueueJobs } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import {
  OPENAI_MODERATION_BACKFILL_POSTS_JOB,
  OPENAI_MODERATION_POST_JOB,
} from '@queues/background/enqueues/openai-moderation-jobs'
import { PRIORITY_DISPATCH } from '@queues/background/config'
import { background } from '@queues/background/queues'
import { openaiModerationWorkConfig } from '@services/openai-moderation/work-limits'
import { handleOpenAIModerationOmniSingleJob } from '../../processors/openai-moderation-omni-single.mts'

const PAGE_SIZE = 2

describe('openai moderation post backfill paging', () => {
  it('enqueues one bounded page per run, continues from its last id, and covers every post once', async () => {
    const restore = overrideDynamicConfigFieldsForTest(openaiModerationWorkConfig, {
      backfill_batch_size: PAGE_SIZE,
    })
    try {
      const creator = await createTestUser()
      const postIds: string[] = []
      for (let index = 0; index < 5; index += 1) {
        // Sequential inserts get ascending UUIDv7 ids, so the pages walk them in this order.
        postIds.push(
          await insertTestPost({
            title: `OpenAI backfill paging ${randomUUID()}`,
            slug: `openai-backfill-paging-${randomUUID()}`,
            createdById: creator.id,
            markdown: 'Backfill paging body.',
            clearanceStatus: 'pending',
          }),
        )
      }
      const mine = new Set(postIds)
      const enqueuedOnce = new Map<string, number>()
      let cursor: string | undefined = uuidBefore(postIds[0]!)

      while (cursor !== undefined && enqueuedOnce.size < mine.size) {
        await background.obliterate({ force: true })
        const result = (await handleOpenAIModerationOmniSingleJob({
          data: { afterId: cursor },
          name: OPENAI_MODERATION_BACKFILL_POSTS_JOB.name,
        } as Job<{ afterId: string }>)) as { enqueued: number; hasMore: boolean }
        const jobs = await readAllQueueJobs(background)
        const moderationJobs = jobs.filter(job => job.name === OPENAI_MODERATION_POST_JOB.name)
        const continuations = jobs.filter(
          job => job.name === OPENAI_MODERATION_BACKFILL_POSTS_JOB.name,
        )

        // Never more than one page of moderation jobs waits behind its dispatcher.
        expect(moderationJobs).toHaveLength(result.enqueued)
        expect(result.enqueued).toBeLessThanOrEqual(PAGE_SIZE)
        for (const job of moderationJobs) {
          const id = (job.data as { id: string }).id
          if (mine.has(id)) enqueuedOnce.set(id, (enqueuedOnce.get(id) ?? 0) + 1)
        }
        // The continuation ranks behind the page's tasks and carries the page's last id.
        const last = moderationJobs
          .map(job => (job.data as { id: string }).id)
          .toSorted()
          .at(-1)
        expect(continuations.map(job => job.data)).toEqual(
          result.hasMore ? [{ afterId: last }] : [],
        )
        expect(continuations.every(job => job.opts.priority === PRIORITY_DISPATCH)).toBe(true)
        cursor = result.hasMore ? last : undefined
      }

      expect([...enqueuedOnce.keys()].toSorted()).toEqual([...mine].toSorted())
      expect([...enqueuedOnce.values()].every(count => count === 1)).toBe(true)
    } finally {
      restore()
    }
  })
})
