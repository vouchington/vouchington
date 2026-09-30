import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AutotaggerRssFeedItemJobData } from '@queues/ai-agents/types'
import { autotaggerPaidLimitsConfig } from '@services/autotagger'
import { applyCollaborativeTopicRelations } from '@services/rss-feed-items/collaborative-topic-relations'
import { createAutotaggerFeedItemFixture } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { processAutotaggerRssFeedItem } from './process-autotagger.mts'

vi.mock<typeof import('@services/rss-feed-items/collaborative-topic-relations')>(
  import('@services/rss-feed-items/collaborative-topic-relations'),
  () => ({
    applyCollaborativeTopicRelations: vi.fn<typeof applyCollaborativeTopicRelations>(
      async () => {},
    ),
  }),
)

const applyRelations = vi.mocked(applyCollaborativeTopicRelations)
const restores: Array<() => void> = []
const jobFor = (rssFeedItemId: string) =>
  ({ data: { rss_feed_item_id: rssFeedItemId } }) as Job<AutotaggerRssFeedItemJobData>

describe('collaborative-follower pass for an RSS feed item', () => {
  afterEach(() => {
    restores.splice(0).forEach(restore => restore())
    applyRelations.mockClear()
  })

  it('applies the collaborative relations with the configured plan limits, and no model call', async () => {
    const { itemId } = await createAutotaggerFeedItemFixture()
    restores.push(
      overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, {
        rss_collaborative_plus_max_topics: 7,
        rss_collaborative_pro_max_topics: 9,
      }),
    )

    await expect(processAutotaggerRssFeedItem(jobFor(itemId))).resolves.toBeNull()

    expect(applyRelations).toHaveBeenCalledExactlyOnceWith(itemId, { plusLimit: 7, proLimit: 9 })
  })

  it('does nothing while the autotagger kill switch is off', async () => {
    const { itemId } = await createAutotaggerFeedItemFixture()
    restores.push(
      overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, { enabled: false }),
    )

    await expect(processAutotaggerRssFeedItem(jobFor(itemId))).resolves.toBeNull()

    expect(applyRelations).not.toHaveBeenCalled()
  })

  it('does nothing for a feed item that no longer exists', async () => {
    await expect(processAutotaggerRssFeedItem(jobFor(randomUUID()))).resolves.toBeNull()

    expect(applyRelations).not.toHaveBeenCalled()
  })
})
