import { createHash, randomUUID } from 'node:crypto'
import { Queue } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { callStoryPostAgent } from '@agents/story-post'
import { makeModelCallResult } from '@voucha/test-helpers/agents/model-call-result'
import {
  createTestUrlWithHostname,
  createTestUserDirect,
  insertTestRssFeedItem,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { upsertSystemUser } from '@services/users/system-users'
import { prepareStoryPost } from '@services/stories/story-posts'
import { getStoryItemSummaries } from '@services/stories/get'
import { loadServiceModelSelection, spendCapConfig } from '@services/ai-usage'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getPostByAny } from '@services/posts/get'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { processAIAgentWorkerJob } from '../core.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('story-post receipt admission by slug', () => {
  it('replays a canonical post receipt through a breached spend gate', async () => {
    await upsertSystemUser('story-teller')
    await spendCapConfig.waitForInitialization()
    const restoreAdmission = overrideDynamicConfigFieldsForTest(spendCapConfig, { enabled: false })
    const story = await insertTestStory({ title: `Receipt story ${randomUUID()}` })
    const feedId = (await createTestRssFeed({})).id
    const urlId = await createTestUrlWithHostname()
    for (const index of [1, 2]) {
      const itemData = {
        title: `Item ${index} ${randomUUID()}`,
        link: `https://example.com/${randomUUID()}`,
      }
      const itemId = await insertTestRssFeedItem({
        rssFeedId: feedId,
        urlId,
        guid: `story-slug-receipt-${randomUUID()}`,
        itemData,
        contentSha256: createHash('sha256').update(JSON.stringify(itemData)).digest(),
      })
      await setTestItemStoryId(itemId, story.id)
    }
    const poster = await createTestUserDirect()
    const prepared = await prepareStoryPost(story.id, poster)
    await prepared.finalize()
    const { post } = prepared.response
    const slug = post.slug
    if (!slug) throw new Error('Expected generated story-post slug')
    const selection = await loadServiceModelSelection('story-post')
    const itemSummaries = await getStoryItemSummaries(story.id)
    try {
      await callStoryPostAgent(
        story,
        itemSummaries,
        selection,
        () =>
          Promise.resolve(
            makeModelCallResult({
              title: 'Receipt title',
              ai_summary_markdown: 'Receipt summary.',
            }),
          ),
        post.id,
      )
    } finally {
      restoreAdmission()
    }

    const restoreCap = overrideDynamicConfigFieldsForTest(spendCapConfig, {
      enabled: true,
      daily_cap_microunits: 0,
    })
    const queue = new Queue<AIAgentJobData>(`story_slug_receipt_${randomUUID()}`, {
      connection: workerQueueConnection,
      prefix: workerQueuePrefix,
    })
    try {
      const job = await queue.add('story-post', { post_id: slug, force: false })
      if (!job) throw new Error('Expected native story-post job')
      await expect(processAIAgentWorkerJob(job)).resolves.toMatchObject({
        ai_summary_markdown: 'Receipt summary.',
      })
      await expect(getPostByAny(post.id, { readOnly: false })).resolves.toMatchObject({
        ai_summary_markdown: 'Receipt summary.',
      })
      expect(job.data).not.toHaveProperty('spendCapDelayedDay')
    } finally {
      restoreCap()
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})
