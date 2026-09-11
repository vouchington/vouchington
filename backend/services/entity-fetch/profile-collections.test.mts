import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createUserProfileFixture,
  insertEntityRelation,
  insertTestCommunity,
  insertTestCommunityMember,
  insertUserHiddenRssFeedItem,
  setRssFeedItemMediaType,
} from '@voucha/test-helpers'
import { addUrl } from '@services/urls'
import { updateUserFields } from '@services/users/update-fields'
import {
  getUserCommunitiesCollection,
  getUserHostnamesCollection,
  getUserPostsCollection,
  getUserUrlsCollection,
} from './profile-collections.mts'
import {
  getUserMemberCommunitiesCollection,
  getUserTopicsCollectionPage,
} from './profile-collections-paginated.mts'
import { getUserRssFeedItemsCollection } from './profile-collections-rss-feed-items.mts'

describe('profile collections', () => {
  it('returns compacted entities for relation-backed and recently viewed collections', async () => {
    const suffix = `profile-collections-${Date.now()}`
    const fixture = await createUserProfileFixture({ suffix })

    await insertEntityRelation(
      'relation__user__save__post',
      fixture.owner.id,
      fixture.discussion.id,
    )
    const { results: savedPosts } = await getUserPostsCollection(
      fixture.owner,
      fixture.owner.id,
      'saved',
    )
    expect(savedPosts.map(post => post.id)).toContain(fixture.discussion.id)

    const { results: viewedTopics } = await getUserTopicsCollectionPage(fixture.owner.id, 'viewed')
    expect(viewedTopics.map(topic => topic.id)).toEqual([fixture.viewedTopic.id])

    const { results: savedItems } = await getUserRssFeedItemsCollection(fixture.owner.id, 'saved')
    expect(savedItems.map(item => item.id)).toEqual([fixture.rssItemId])

    const { results: viewedItems } = await getUserRssFeedItemsCollection(fixture.owner.id, 'viewed')
    expect(viewedItems.map(item => item.id)).toEqual([fixture.rssItemId])

    await insertUserHiddenRssFeedItem(fixture.owner.id, fixture.rssItemId)
    const { results: hiddenItems } = await getUserRssFeedItemsCollection(fixture.owner.id, 'hidden')
    expect(hiddenItems.map(item => item.id)).toEqual([fixture.rssItemId])

    await setRssFeedItemMediaType(fixture.rssItemId, 'article')
    const { results: savedArticles } = await getUserRssFeedItemsCollection(
      fixture.owner.id,
      'saved',
      { limit: 100, mediaType: 'article' },
    )
    expect(savedArticles.map(item => item.id)).toContain(fixture.rssItemId)

    const { results: viewedArticles } = await getUserRssFeedItemsCollection(
      fixture.owner.id,
      'viewed',
      { limit: 100, mediaType: 'article' },
    )
    expect(viewedArticles.map(item => item.id)).toContain(fixture.rssItemId)

    const { results: viewedAudio } = await getUserRssFeedItemsCollection(
      fixture.owner.id,
      'viewed',
      {
        limit: 100,
        mediaType: 'audio',
      },
    )
    expect(viewedAudio.map(item => item.id)).not.toContain(fixture.rssItemId)

    const url = await addUrl(null, `https://example.com/${suffix}`, { content_type: 'text/html' })
    if (!url) throw new Error('Failed to create profile collection URL')
    const hostnameId = (url as { hostname_id?: string }).hostname_id ?? url.hostname.id
    await insertEntityRelation('relation__user__save__url', fixture.owner.id, url.id)
    await insertEntityRelation('relation__user__block__url_hostname', fixture.owner.id, hostnameId)

    const { results: savedUrls } = await getUserUrlsCollection(fixture.owner.id, 'saved')
    expect(savedUrls.map(result => result.id)).toEqual([url.id])

    const { results: blockedHostnames } = await getUserHostnamesCollection(
      fixture.owner.id,
      'blocked',
    )
    expect(blockedHostnames.map(hostname => hostname.id)).toEqual([hostnameId])

    const community = await insertTestCommunity({ createdById: fixture.owner.id })
    await insertEntityRelation('relation__user__save__community', fixture.owner.id, community.id)

    const { results: savedCommunities } = await getUserCommunitiesCollection(
      fixture.owner,
      fixture.owner.id,
      'saved',
    )
    expect(savedCommunities.map(result => result.id)).toEqual([community.id])
    expect(savedCommunities[0]?.owner?.id).toBe(fixture.owner.id)
  })
})

describe('getUserCommunitiesCollection member roster visibility', () => {
  it('excludes regular membership in moderators-only roster community', async () => {
    const user = await createTestUser()
    await updateUserFields(user.id, { community_memberships_visibility: 'everyone' })
    const pub = await insertTestCommunity({ createdById: user.id, visibility: 'public' })
    const mod = await insertTestCommunity({
      createdById: user.id,
      visibility: 'public',
      member_roster_visibility: 'moderators',
    })
    await Promise.all([
      insertTestCommunityMember({ communityId: pub.id, userId: user.id, role: 'member' }),
      insertTestCommunityMember({ communityId: mod.id, userId: user.id, role: 'member' }),
    ])

    const { results: result } = await getUserMemberCommunitiesCollection(null, user.id)
    const ids = result.map(c => c.id)
    expect(ids).toContain(pub.id)
    expect(ids).not.toContain(mod.id)
  })

  it('includes owner role even in moderators-only roster community', async () => {
    const user = await createTestUser()
    await updateUserFields(user.id, { community_memberships_visibility: 'everyone' })
    const mod = await insertTestCommunity({
      createdById: user.id,
      visibility: 'public',
      member_roster_visibility: 'moderators',
    })
    await insertTestCommunityMember({ communityId: mod.id, userId: user.id, role: 'owner' })

    const { results: result } = await getUserMemberCommunitiesCollection(null, user.id)
    expect(result.map(c => c.id)).toContain(mod.id)
  })

  it('hides users-only roster community from anonymous, shows to logged-in viewer', async () => {
    const user = await createTestUser()
    const viewer = await createTestUser()
    await updateUserFields(user.id, { community_memberships_visibility: 'everyone' })
    const usersRoster = await insertTestCommunity({
      createdById: user.id,
      visibility: 'public',
      member_roster_visibility: 'users',
    })
    await insertTestCommunityMember({
      communityId: usersRoster.id,
      userId: user.id,
      role: 'member',
    })

    const { results: anonResult } = await getUserMemberCommunitiesCollection(null, user.id)
    expect(anonResult.map(c => c.id)).not.toContain(usersRoster.id)

    const { results: authResult } = await getUserMemberCommunitiesCollection(viewer, user.id)
    expect(authResult.map(c => c.id)).toContain(usersRoster.id)
  })

  it('hides members-only roster community from non-member viewer, shows to member viewer', async () => {
    const user = await createTestUser()
    const memberViewer = await createTestUser()
    const strangerViewer = await createTestUser()
    await updateUserFields(user.id, { community_memberships_visibility: 'everyone' })
    const membersRoster = await insertTestCommunity({
      createdById: user.id,
      visibility: 'public',
      member_roster_visibility: 'members',
    })
    await Promise.all([
      insertTestCommunityMember({ communityId: membersRoster.id, userId: user.id, role: 'member' }),
      insertTestCommunityMember({
        communityId: membersRoster.id,
        userId: memberViewer.id,
        role: 'member',
      }),
    ])

    const { results: strangerResult } = await getUserMemberCommunitiesCollection(
      strangerViewer,
      user.id,
    )
    expect(strangerResult.map(c => c.id)).not.toContain(membersRoster.id)

    const { results: memberResult } = await getUserMemberCommunitiesCollection(
      memberViewer,
      user.id,
    )
    expect(memberResult.map(c => c.id)).toContain(membersRoster.id)
  })
})
