import { describe, it, expect } from 'vitest'
import {
  createTestUser,
  createTestTopic,
  muteRssFeed,
  muteTopic,
  hideRssFeedItem,
  insertTestCommunity,
  insertTestCommunityListItem,
  insertTestProxyMuteCommunity,
  addCategoryToRssFeedItem,
  addRssFeedItemSource,
  insertTestRssFeedDirect,
  createTopHashtagAliasForTest,
  createTopHashtagRssSourceForTest,
  addRssFeedTopicPublisherTypeWithScore,
  insertTestUrlHostname,
  insertTestUrl,
  blockUrlHostname,
  muteUrlHostname,
} from '@voucha/test-helpers'
import {
  createTestStoryMembers,
  setTestStoryMemberSourceState,
  insertTestStoryMemberTopic,
} from '@voucha/test-helpers/entities/story-member-pages'
import { setTestRssFeedDiscoverable } from '@voucha/test-helpers/entities/rss-feeds-discovery'
import { softDeleteRssFeedItemsForTest } from '@voucha/test-helpers/sql-rss-feeds'
import type { BasicUser } from '@services/users/types'
import { getStoryMemberPagesBatch } from './story-member-pages.mts'

async function selected(viewer: BasicUser | null, storyId: string) {
  return (await getStoryMemberPagesBatch(viewer, [{ story_id: storyId }], { limit: 25 }))[storyId]!
    .item_ids
}

describe('story member visibility', () => {
  it('requires the same source to be discoverable and unmuted for multisource members', async () => {
    const user = await createTestUser()
    const fixture = await createTestStoryMembers(1)
    const undiscoverable = await insertTestRssFeedDirect({})
    await setTestRssFeedDiscoverable(undiscoverable.id, false)
    await addRssFeedItemSource(undiscoverable.id, fixture.itemIds[0]!)
    await muteRssFeed(user, fixture.feed.id)
    expect(await selected(user, fixture.story.id)).toEqual([])
    expect(await selected(null, fixture.story.id)).toEqual(fixture.itemIds)
    const visible = await insertTestRssFeedDirect({})
    await addRssFeedItemSource(visible.id, fixture.itemIds[0]!)
    expect(await selected(user, fixture.story.id)).toEqual(fixture.itemIds)
  })

  it('excludes deleted items, disabled or deleted sources and nondiscoverable-only items', async () => {
    for (const state of ['item-deleted', 'disabled', 'deleted', 'undiscoverable'] as const) {
      const fixture = await createTestStoryMembers(1)
      if (state === 'item-deleted') await softDeleteRssFeedItemsForTest(fixture.itemIds)
      else if (state === 'undiscoverable') await setTestRssFeedDiscoverable(fixture.feed.id, false)
      else await setTestStoryMemberSourceState(fixture.feed.id, state)
      expect(await selected(null, fixture.story.id)).toEqual([])
    }
  })

  it('applies viewer hidden, category, positive direct and alias topic mutes', async () => {
    const user = await createTestUser()
    const fixture = await createTestStoryMembers(6)
    const muted = await createTestTopic()
    await muteTopic(user, muted)
    await hideRssFeedItem(user, { id: fixture.itemIds[0]! })
    await addCategoryToRssFeedItem(fixture.itemIds[1]!, muted.id)
    await insertTestStoryMemberTopic(fixture.itemIds[2]!, muted.id, 1)
    const aliasId = await createTopHashtagAliasForTest(muted.id, `story-alias-${fixture.story.id}`)
    await createTopHashtagRssSourceForTest({
      rssFeedItemId: fixture.itemIds[3]!,
      topicAliasId: aliasId,
      authoredToken: `#story-alias-${fixture.story.id}`,
    })
    await insertTestStoryMemberTopic(fixture.itemIds[4]!, muted.id, 0)
    expect(await selected(user, fixture.story.id)).toEqual(fixture.itemIds.slice(4))
    expect(await selected(null, fixture.story.id)).toEqual(fixture.itemIds)
  })

  it('uses the highest positive nondeleted publisher-type relation for source mutes', async () => {
    const [user, owner, muted, visible] = await Promise.all([
      createTestUser(),
      createTestTopic(),
      createTestTopic(),
      createTestTopic(),
    ])
    const fixture = await createTestStoryMembers(1, { topicId: owner.id })
    await muteTopic(user, muted)
    await addRssFeedTopicPublisherTypeWithScore(owner.id, muted.id, 1)
    await addRssFeedTopicPublisherTypeWithScore(owner.id, visible.id, 2)
    expect(await selected(user, fixture.story.id)).toEqual(fixture.itemIds)
    const mutedOwner = await createTestTopic()
    const blocked = await createTestStoryMembers(1, { topicId: mutedOwner.id })
    await addRssFeedTopicPublisherTypeWithScore(mutedOwner.id, muted.id, 2)
    await addRssFeedTopicPublisherTypeWithScore(mutedOwner.id, visible.id, 1)
    expect(await selected(user, blocked.story.id)).toEqual([])
  })

  it('applies accessible proxy-muted community lists without request membership', async () => {
    const user = await createTestUser()
    const fixture = await createTestStoryMembers(1)
    const community = await insertTestCommunity({ createdById: user.id })
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'rss_feed',
      entityId: fixture.feed.id,
    })
    await insertTestProxyMuteCommunity(user.id, community.id)
    expect(await selected(user, fixture.story.id)).toEqual([])
    expect(await selected(null, fixture.story.id)).toEqual(fixture.itemIds)
  })

  it('excludes global blocked hostnames for anonymous viewers and user blocked or muted descendants', async () => {
    const user = await createTestUser()
    for (const mode of ['global', 'block', 'mute'] as const) {
      const suffix = `${user.id}-${mode}.example.com`
      const parentId = await insertTestUrlHostname({ hostname: suffix })
      const childId = await insertTestUrlHostname({
        hostname: `child.${suffix}`,
        blocked: mode === 'global',
      })
      const urlId = await insertTestUrl({
        url: `https://child.${suffix}/article`,
        hostnameId: childId,
      })
      const fixture = await createTestStoryMembers(1, { urlId })
      if (mode === 'block') await blockUrlHostname(user, parentId)
      if (mode === 'mute') await muteUrlHostname(user, parentId)
      expect(await selected(user, fixture.story.id)).toEqual([])
      expect(await selected(null, fixture.story.id)).toEqual(
        mode === 'global' ? [] : fixture.itemIds,
      )
    }
  })

  it('retains public and viewer eligibility for administrators', async () => {
    const user = await createTestUser()
    const administrator = { ...user, roles: [...user.roles, 'administrator'] }
    const fixture = await createTestStoryMembers(2)
    await hideRssFeedItem(user, { id: fixture.itemIds[0]! })
    expect(await selected(administrator, fixture.story.id)).toEqual(fixture.itemIds.slice(1))
    await setTestRssFeedDiscoverable(fixture.feed.id, false)
    expect(await selected(administrator, fixture.story.id)).toEqual([])
  })
})
