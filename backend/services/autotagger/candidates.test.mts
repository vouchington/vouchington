import { reserveClassifierRun } from '@services/classifier-runs'
import {
  createAutotaggerFeedItemFixture,
  createAutotaggerPostFixture,
  createNearbyTopic,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { getClassifierRunCandidateTopicIdsForTest } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { addCategoryToRssFeedItem } from '@voucha/test-helpers/entities/rss-feed-items'
import { afterEach, describe, expect, it } from 'vitest'
import { createAutotaggerRunAdapter } from './adapter.mts'
import { autotaggerPaidLimitsConfig } from './limits-config.mts'

const adapter = createAutotaggerRunAdapter()
const restores: Array<() => void> = []

function overrideLimits(fields: Record<string, boolean | number>) {
  restores.push(overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, fields))
}

/** The topics a fresh receipt for `subject` captured, in the order the run asks about them. */
async function capturedTopicIds(subject: Parameters<typeof reserveClassifierRun>[1]) {
  const result = await reserveClassifierRun(adapter, subject)
  return result.kind === 'reserved'
    ? getClassifierRunCandidateTopicIdsForTest(result.run.runId)
    : result.kind
}

describe('C6 candidate capture (real PG)', () => {
  afterEach(() => restores.splice(0).forEach(restore => restore()))

  it.each([
    ['a plus author gets the plus cap', { plan: 'plus' as const }, 1],
    ['a pro author gets the pro cap', { plan: 'pro' as const }, 3],
    ['an administrator without a plan gets the pro cap', { plan: null, administrator: true }, 3],
  ])('%s', async (_name, author, expected) => {
    overrideLimits({ post_plus_max_topics: 1, post_pro_max_topics: 3 })
    const fixture = await createAutotaggerPostFixture({ ...author, topicCount: 4 })

    expect(await capturedTopicIds(fixture.subject)).toHaveLength(expected)
  })

  it('gives a free author no candidates unless the operator raises the free cap', async () => {
    const fixture = await createAutotaggerPostFixture({ plan: null, topicCount: 2 })
    expect(await capturedTopicIds(fixture.subject)).toBe('no-work')

    overrideLimits({ post_free_max_topics: 1 })
    const raised = await createAutotaggerPostFixture({ plan: null, topicCount: 2 })
    expect(await capturedTopicIds(raised.subject)).toHaveLength(1)
  })

  it('captures the nearest topics first, up to the cap', async () => {
    overrideLimits({ post_plus_max_topics: 2 })
    const fixture = await createAutotaggerPostFixture({ topicCount: 0 })
    await createNearbyTopic(fixture.embedding, 0.5)
    const near = await createNearbyTopic(fixture.embedding, 0.05)
    const nearest = await createNearbyTopic(fixture.embedding, 0.001)

    expect(await capturedTopicIds(fixture.subject)).toEqual([nearest.id, near.id])
  })

  it('puts a feed item’s own category topics first and caps at the discoverable budget', async () => {
    overrideLimits({ rss_discoverable_llm_max_topics: 2 })
    const fixture = await createAutotaggerFeedItemFixture({ topicCount: 3 })
    const category = await createNearbyTopic(fixture.embedding)
    await addCategoryToRssFeedItem(fixture.itemId, category.id)

    const captured = await capturedTopicIds(fixture.subject)

    expect(captured).toHaveLength(2)
    expect(captured[0]).toBe(category.id)
  })

  it('settles a feed item as no work when the discoverable budget is zero', async () => {
    overrideLimits({ rss_discoverable_llm_max_topics: 0 })
    const fixture = await createAutotaggerFeedItemFixture()

    expect(await capturedTopicIds(fixture.subject)).toBe('no-work')
  })
})
