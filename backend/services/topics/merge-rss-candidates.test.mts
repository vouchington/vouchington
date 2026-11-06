import { describe, expect, it } from 'vitest'
import {
  createTestTopic,
  createTestUser,
  insertTestRssFeedDirect,
  createTestRssFeedItemWithUrl,
} from '@voucha/test-helpers'
import { addCategoryToRssFeedItem } from '@voucha/test-helpers/entities/rss-feed-item-category-fixtures'
import {
  readCandidateFixture,
  setCandidateAliasClaim,
  setCandidateTopicClaim,
  addCandidateTopicBallot,
  addCandidateAliasBallot,
} from '@voucha/test-helpers/rss-feed-candidates'
import { mergeTopicsForTest as mergeTopicAliases } from '@voucha/test-helpers/merge-topics'
import { getTopicByAny } from './get.mts'
import { createTopicAliases } from './aliases.mts'

describe('topic merge RSS candidate membership', () => {
  it('rebuilds topic candidate counts from moved topic and alias contributions', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = (await getTopicByAny((await createTestTopic({ user: admin })).id))!
    const destination = (await getTopicByAny((await createTestTopic({ user: admin })).id))!
    const feed = await insertTestRssFeedDirect({ topicId: (await createTestTopic()).id })
    const item = await createTestRssFeedItemWithUrl(feed.id)
    const [alias] = await createTopicAliases(source.id, `merge-candidate-${item.id}`)
    await addCategoryToRssFeedItem(item.id, destination.id, `merge-destination-${item.id}`)
    await setCandidateTopicClaim(item.id, source.id, 1)
    await setCandidateAliasClaim(item.id, alias!.id, 1)
    await addCandidateTopicBallot(item.id, source.id, admin.id)
    await addCandidateAliasBallot(item.id, alias!.id, admin.id)
    expect((await readCandidateFixture(item.id, [feed.id])).topics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topic_id: source.id, membership_count: '2' }),
        expect.objectContaining({ topic_id: destination.id, membership_count: '1' }),
      ]),
    )

    await mergeTopicAliases(admin, source, destination)

    expect((await readCandidateFixture(item.id, [feed.id])).topics).toMatchObject([
      { topic_id: destination.id, membership_count: '3' },
    ])
  })
})
