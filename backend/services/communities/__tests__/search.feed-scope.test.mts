import { describe, expect, it, beforeAll } from 'vitest'
import {
  createRandomString,
  createTestPost,
  createTestRssFeedWithTiming,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityListItem,
  insertTestCommunityMember,
  insertTestProxyFollowCommunity,
  insertTestProxyMuteCommunity,
  insertTestTopic,
} from '@voucha/test-helpers'
import { searchCommunities } from '../search.mts'
import type { PrivateUser } from '@services/users/types'

describe('search.feed-scope', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('searchCommunities listScope=mine feed filters', () => {
    it('returns joined and proxy-followed list communities relevant to posts', async () => {
      const rand = createRandomString(8)
      const viewer = await createTestUser()
      const [
        joinedCommunity,
        proxyCommunity,
        mutedCommunity,
        joinedMutedCommunity,
        unrelatedCommunity,
      ] = await Promise.all([
        insertTestCommunity({
          createdById: user.id,
          name: `${rand} Joined`,
          slug: `${rand}-mine-joined`,
        }),
        insertTestCommunity({
          createdById: user.id,
          name: `${rand} Proxy`,
          slug: `${rand}-mine-proxy`,
        }),
        insertTestCommunity({
          createdById: user.id,
          name: `${rand} Muted`,
          slug: `${rand}-mine-muted`,
        }),
        insertTestCommunity({
          createdById: user.id,
          name: `${rand} Joined Muted`,
          slug: `${rand}-mine-joined-muted`,
        }),
        insertTestCommunity({
          createdById: user.id,
          name: `${rand} Other`,
          slug: `${rand}-mine-other`,
        }),
      ])
      const topicId = await insertTestTopic({
        name: `Mine Topic ${rand}`,
        slug: `mine-topic-${rand}`,
        createdById: user.id,
      })
      await Promise.all([
        insertTestCommunityMember({ communityId: joinedCommunity.id, userId: viewer.id }),
        insertTestCommunityMember({ communityId: joinedMutedCommunity.id, userId: viewer.id }),
        insertTestProxyFollowCommunity(viewer.id, proxyCommunity.id),
        insertTestProxyMuteCommunity(viewer.id, mutedCommunity.id),
        insertTestProxyMuteCommunity(viewer.id, joinedMutedCommunity.id),
        insertTestCommunityListItem({
          communityId: joinedCommunity.id,
          itemType: 'topic',
          entityId: topicId,
        }),
        insertTestCommunityListItem({
          communityId: proxyCommunity.id,
          itemType: 'topic',
          entityId: topicId,
        }),
        insertTestCommunityListItem({
          communityId: mutedCommunity.id,
          itemType: 'topic',
          entityId: topicId,
        }),
        insertTestCommunityListItem({
          communityId: joinedMutedCommunity.id,
          itemType: 'topic',
          entityId: topicId,
        }),
        insertTestCommunityListItem({
          communityId: unrelatedCommunity.id,
          itemType: 'topic',
          entityId: topicId,
        }),
      ])

      const result = await searchCommunities({
        currentUser: viewer,
        listScope: 'mine',
        feedCategory: 'posts',
        hasListItems: true,
        search: rand,
      })
      const ids = result.results.map(r => r.id)

      expect(ids).toContain(joinedCommunity.id)
      expect(ids).toContain(proxyCommunity.id)
      expect(ids).not.toContain(mutedCommunity.id)
      expect(ids).not.toContain(joinedMutedCommunity.id)
      expect(ids).not.toContain(unrelatedCommunity.id)
    })

    it('returns joined and proxy-followed list communities relevant to news', async () => {
      const rand = createRandomString(8)
      const viewer = await createTestUser()
      const [
        joinedRssCommunity,
        proxyTopicCommunity,
        mutedRssCommunity,
        unrelatedRssCommunity,
        postsOnlyCommunity,
      ] = await Promise.all([
        insertTestCommunity({
          createdById: user.id,
          name: `${rand} News Joined RSS`,
          slug: `${rand}-news-joined-rss`,
        }),
        insertTestCommunity({
          createdById: user.id,
          name: `${rand} News Proxy Topic`,
          slug: `${rand}-news-proxy-topic`,
        }),
        insertTestCommunity({
          createdById: user.id,
          name: `${rand} News Muted RSS`,
          slug: `${rand}-news-muted-rss`,
        }),
        insertTestCommunity({
          createdById: user.id,
          name: `${rand} News Other RSS`,
          slug: `${rand}-news-other-rss`,
        }),
        insertTestCommunity({
          createdById: user.id,
          name: `${rand} News Posts Only`,
          slug: `${rand}-news-posts-only`,
        }),
      ])
      const topicId = await insertTestTopic({
        name: `News Mine Topic ${rand}`,
        slug: `news-mine-topic-${rand}`,
        createdById: user.id,
      })
      const feedId = await createTestRssFeedWithTiming(topicId)
      const post = await createTestPost({ user })
      await Promise.all([
        insertTestCommunityMember({ communityId: joinedRssCommunity.id, userId: viewer.id }),
        insertTestProxyFollowCommunity(viewer.id, proxyTopicCommunity.id),
        insertTestProxyMuteCommunity(viewer.id, mutedRssCommunity.id),
        insertTestCommunityListItem({
          communityId: joinedRssCommunity.id,
          itemType: 'rss_feed',
          entityId: feedId,
        }),
        insertTestCommunityListItem({
          communityId: proxyTopicCommunity.id,
          itemType: 'topic',
          entityId: topicId,
        }),
        insertTestCommunityListItem({
          communityId: mutedRssCommunity.id,
          itemType: 'rss_feed',
          entityId: feedId,
        }),
        insertTestCommunityListItem({
          communityId: unrelatedRssCommunity.id,
          itemType: 'rss_feed',
          entityId: feedId,
        }),
        insertTestCommunityListItem({
          communityId: postsOnlyCommunity.id,
          itemType: 'post',
          entityId: post.id,
        }),
      ])

      const result = await searchCommunities({
        currentUser: viewer,
        listScope: 'mine',
        feedCategory: 'news',
        hasListItems: true,
        search: rand,
      })
      const ids = result.results.map(r => r.id)

      expect(ids).toContain(joinedRssCommunity.id)
      expect(ids).toContain(proxyTopicCommunity.id)
      expect(ids).not.toContain(mutedRssCommunity.id)
      expect(ids).not.toContain(unrelatedRssCommunity.id)
      expect(ids).not.toContain(postsOnlyCommunity.id)
    })

    it('filters news list communities by source or topic subfeed category', async () => {
      const rand = createRandomString(8)
      const viewer = await createTestUser()
      const [rssOnlyCommunity, topicOnlyCommunity, bothCommunity] = await Promise.all([
        insertTestCommunity({
          createdById: user.id,
          name: `${rand} RSS Only`,
          slug: `${rand}-rss-only`,
        }),
        insertTestCommunity({
          createdById: user.id,
          name: `${rand} Topic Only`,
          slug: `${rand}-topic-only`,
        }),
        insertTestCommunity({
          createdById: user.id,
          name: `${rand} Both`,
          slug: `${rand}-both`,
        }),
      ])
      const topicId = await insertTestTopic({
        name: `News Scoped Topic ${rand}`,
        slug: `news-scoped-topic-${rand}`,
        createdById: user.id,
      })
      const feedId = await createTestRssFeedWithTiming(topicId)
      await Promise.all([
        insertTestCommunityMember({ communityId: rssOnlyCommunity.id, userId: viewer.id }),
        insertTestCommunityMember({ communityId: topicOnlyCommunity.id, userId: viewer.id }),
        insertTestCommunityMember({ communityId: bothCommunity.id, userId: viewer.id }),
        insertTestCommunityListItem({
          communityId: rssOnlyCommunity.id,
          itemType: 'rss_feed',
          entityId: feedId,
        }),
        insertTestCommunityListItem({
          communityId: topicOnlyCommunity.id,
          itemType: 'topic',
          entityId: topicId,
        }),
        insertTestCommunityListItem({
          communityId: bothCommunity.id,
          itemType: 'rss_feed',
          entityId: feedId,
        }),
        insertTestCommunityListItem({
          communityId: bothCommunity.id,
          itemType: 'topic',
          entityId: topicId,
        }),
      ])

      const sourceResult = await searchCommunities({
        currentUser: viewer,
        listScope: 'mine',
        feedCategory: 'news_sources',
        hasListItems: true,
        search: rand,
      })
      const topicResult = await searchCommunities({
        currentUser: viewer,
        listScope: 'mine',
        feedCategory: 'news_topics',
        hasListItems: true,
        search: rand,
      })
      const sourceIds = sourceResult.results.map(r => r.id)
      const topicIds = topicResult.results.map(r => r.id)

      expect(sourceIds).toContain(rssOnlyCommunity.id)
      expect(sourceIds).toContain(bothCommunity.id)
      expect(sourceIds).not.toContain(topicOnlyCommunity.id)
      expect(topicIds).toContain(topicOnlyCommunity.id)
      expect(topicIds).toContain(bothCommunity.id)
      expect(topicIds).not.toContain(rssOnlyCommunity.id)
    })
  })
})
