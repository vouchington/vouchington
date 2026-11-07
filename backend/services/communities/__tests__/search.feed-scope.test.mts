import { describe, expect, it, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
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
import type { Community } from '@voucha/types/entities/community'
import { searchCommunities } from '../search.mts'
import type { CommunityFeedCategory } from '../search-types.mts'

type MineFeedMembership = 'member' | 'proxy-follow' | 'proxy-mute' | 'member-and-mute' | 'none'
type MineFeedListItem = 'topic' | 'rss_feed' | 'post'

type MineFeedCommunitySpec = {
  key: string
  name: string
  slugSuffix: string
  membership: MineFeedMembership
  listItems: readonly MineFeedListItem[]
}

type MineFeedFixtures = {
  topicId: string
  feedId: string | undefined
  postId: string | undefined
}

type MineFeedScope = {
  communityId: (key: string) => string
  search: (feedCategory: CommunityFeedCategory) => Promise<readonly string[]>
}

function mineFeedCommunity(
  key: string,
  name: string,
  slugSuffix: string,
  membership: MineFeedMembership,
  listItems: readonly MineFeedListItem[],
): MineFeedCommunitySpec {
  return { key, name, slugSuffix, membership, listItems }
}

const postsMineFeedCommunities = [
  mineFeedCommunity('joined', 'Joined', 'mine-joined', 'member', ['topic']),
  mineFeedCommunity('proxy', 'Proxy', 'mine-proxy', 'proxy-follow', ['topic']),
  mineFeedCommunity('muted', 'Muted', 'mine-muted', 'proxy-mute', ['topic']),
  mineFeedCommunity('joined-muted', 'Joined Muted', 'mine-joined-muted', 'member-and-mute', [
    'topic',
  ]),
  mineFeedCommunity('other', 'Other', 'mine-other', 'none', ['topic']),
] as const satisfies readonly MineFeedCommunitySpec[]

const newsMineFeedCommunities = [
  mineFeedCommunity('joined-rss', 'News Joined RSS', 'news-joined-rss', 'member', ['rss_feed']),
  mineFeedCommunity('proxy-topic', 'News Proxy Topic', 'news-proxy-topic', 'proxy-follow', [
    'topic',
  ]),
  mineFeedCommunity('muted-rss', 'News Muted RSS', 'news-muted-rss', 'proxy-mute', ['rss_feed']),
  mineFeedCommunity('other-rss', 'News Other RSS', 'news-other-rss', 'none', ['rss_feed']),
  mineFeedCommunity('posts-only', 'News Posts Only', 'news-posts-only', 'none', ['post']),
] as const satisfies readonly MineFeedCommunitySpec[]

const newsSubfeedCommunities = [
  mineFeedCommunity('rss-only', 'RSS Only', 'rss-only', 'member', ['rss_feed']),
  mineFeedCommunity('topic-only', 'Topic Only', 'topic-only', 'member', ['topic']),
  mineFeedCommunity('both', 'Both', 'both', 'member', ['rss_feed', 'topic']),
] as const satisfies readonly MineFeedCommunitySpec[]

function requireCommunity(communities: ReadonlyMap<string, Community>, key: string): Community {
  const community = communities.get(key)
  if (!community) throw new Error(`missing feed-scope community ${key}`)
  return community
}

function membershipWrites(
  viewerId: string,
  communityId: string,
  membership: MineFeedMembership,
): Promise<unknown>[] {
  switch (membership) {
    case 'member':
      return [insertTestCommunityMember({ communityId, userId: viewerId })]
    case 'proxy-follow':
      return [insertTestProxyFollowCommunity(viewerId, communityId)]
    case 'proxy-mute':
      return [insertTestProxyMuteCommunity(viewerId, communityId)]
    case 'member-and-mute':
      return [
        insertTestCommunityMember({ communityId, userId: viewerId }),
        insertTestProxyMuteCommunity(viewerId, communityId),
      ]
    case 'none':
      return []
  }
}

function listItemEntityId(itemType: MineFeedListItem, fixtures: MineFeedFixtures): string {
  switch (itemType) {
    case 'topic':
      return fixtures.topicId
    case 'rss_feed': {
      if (fixtures.feedId === undefined) {
        throw new Error('rss_feed list item requires an RSS feed fixture')
      }
      return fixtures.feedId
    }
    case 'post': {
      if (fixtures.postId === undefined) {
        throw new Error('post list item requires a post fixture')
      }
      return fixtures.postId
    }
  }
}

async function insertScenarioCommunities(
  ownerId: string,
  rand: string,
  specs: readonly MineFeedCommunitySpec[],
): Promise<ReadonlyMap<string, Community>> {
  const created = await Promise.all(
    specs.map(spec =>
      insertTestCommunity({
        createdById: ownerId,
        name: `${rand} ${spec.name}`,
        slug: `${rand}-${spec.slugSuffix}`,
      }),
    ),
  )
  const communities = new Map<string, Community>()
  for (const [index, spec] of specs.entries()) {
    const community = created[index]
    if (!community) throw new Error(`missing inserted community ${spec.key}`)
    communities.set(spec.key, community)
  }
  return communities
}

async function createScenarioFixtures(
  owner: PrivateUser,
  rand: string,
  specs: readonly MineFeedCommunitySpec[],
): Promise<MineFeedFixtures> {
  const topicId = await insertTestTopic({
    name: `Feed Topic ${rand}`,
    slug: `feed-topic-${rand}`,
    createdById: owner.id,
  })
  const feedId = specs.some(spec => spec.listItems.includes('rss_feed'))
    ? await createTestRssFeedWithTiming(topicId)
    : undefined
  const post = specs.some(spec => spec.listItems.includes('post'))
    ? await createTestPost({ user: owner })
    : undefined
  return { topicId, feedId, postId: post?.id }
}

async function attachScenarioRelations(
  viewerId: string,
  communities: ReadonlyMap<string, Community>,
  specs: readonly MineFeedCommunitySpec[],
  fixtures: MineFeedFixtures,
): Promise<void> {
  await Promise.all(
    specs.flatMap(spec => {
      const community = requireCommunity(communities, spec.key)
      return [
        ...membershipWrites(viewerId, community.id, spec.membership),
        ...spec.listItems.map(itemType =>
          insertTestCommunityListItem({
            communityId: community.id,
            itemType,
            entityId: listItemEntityId(itemType, fixtures),
          }),
        ),
      ]
    }),
  )
}

async function createMineFeedScope(
  owner: PrivateUser,
  specs: readonly MineFeedCommunitySpec[],
): Promise<MineFeedScope> {
  const rand = createRandomString(8)
  const [viewer, communities, fixtures] = await Promise.all([
    createTestUser(),
    insertScenarioCommunities(owner.id, rand, specs),
    createScenarioFixtures(owner, rand, specs),
  ])
  await attachScenarioRelations(viewer.id, communities, specs, fixtures)
  return {
    communityId: key => requireCommunity(communities, key).id,
    search: async feedCategory => {
      const result = await searchCommunities({
        currentUser: viewer,
        listScope: 'mine',
        feedCategory,
        hasListItems: true,
        search: rand,
      })
      return result.results.map(community => community.id)
    },
  }
}

describe('search.feed-scope', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('searchCommunities listScope=mine feed filters', () => {
    it('returns joined and proxy-followed list communities relevant to posts', async () => {
      const scope = await createMineFeedScope(user, postsMineFeedCommunities)
      const ids = await scope.search('posts')

      expect(ids).toContain(scope.communityId('joined'))
      expect(ids).toContain(scope.communityId('proxy'))
      expect(ids).not.toContain(scope.communityId('muted'))
      expect(ids).not.toContain(scope.communityId('joined-muted'))
      expect(ids).not.toContain(scope.communityId('other'))
    })

    it('returns joined and proxy-followed list communities relevant to news', async () => {
      const scope = await createMineFeedScope(user, newsMineFeedCommunities)
      const ids = await scope.search('news')

      expect(ids).toContain(scope.communityId('joined-rss'))
      expect(ids).toContain(scope.communityId('proxy-topic'))
      expect(ids).not.toContain(scope.communityId('muted-rss'))
      expect(ids).not.toContain(scope.communityId('other-rss'))
      expect(ids).not.toContain(scope.communityId('posts-only'))
    })

    it('filters news list communities by source or topic subfeed category', async () => {
      const scope = await createMineFeedScope(user, newsSubfeedCommunities)
      const [sourceIds, topicIds] = await Promise.all([
        scope.search('news_sources'),
        scope.search('news_topics'),
      ])

      expect(sourceIds).toContain(scope.communityId('rss-only'))
      expect(sourceIds).toContain(scope.communityId('both'))
      expect(sourceIds).not.toContain(scope.communityId('topic-only'))
      expect(topicIds).toContain(scope.communityId('topic-only'))
      expect(topicIds).toContain(scope.communityId('both'))
      expect(topicIds).not.toContain(scope.communityId('rss-only'))
    })
  })
})
