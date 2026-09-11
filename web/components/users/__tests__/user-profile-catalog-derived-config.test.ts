// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { TOP_LEVEL_TABS, getTopLevelTabHref } from '../user-profile-tabs-config'
import { USER_RELATION_ACTIONS } from '../user-relation-actions'

describe('catalog-derived user profile config', () => {
  it('derives tab hrefs for the public profile tab structure', () => {
    expect(TOP_LEVEL_TABS.map(tab => getTopLevelTabHref(tab, 'alice'))).toEqual([
      '/user/alice',
      '/user/alice/posts',
      '/user/alice/topics/following',
      '/user/alice/users/following',
      '/user/alice/rss-feeds/following',
      '/user/alice/communities/member',
    ])
  })

  it('derives relation action labels and predicates from action metadata', () => {
    expect(
      Object.fromEntries(
        Object.entries(USER_RELATION_ACTIONS).map(([group, actions]) => [
          group,
          Object.keys(actions),
        ]),
      ),
    ).toEqual({
      community: ['saved', 'proxyFollowing', 'proxyMuted'],
      domain: ['blocked', 'muted'],
      post: ['saved', 'hidden', 'following', 'subscribed'],
      rssFeed: ['following', 'subscribed', 'muted'],
      rssFeedItem: ['saved', 'hidden'],
      topic: ['blocked', 'muted', 'subscribedPosts', 'subscribedNews', 'dismissed'],
      url: ['saved'],
      user: ['blocked', 'muted', 'subscribedPosts', 'dismissed'],
    })
    expect(USER_RELATION_ACTIONS.post.saved).toMatchObject({
      entityType: 'post',
      predicate: 'save',
      activeLabel: 'extracted.userProfileCollections.postsTopics.saved_b5c120b3',
    })
    expect(USER_RELATION_ACTIONS.topic.subscribedNews).toMatchObject({
      entityType: 'topic',
      predicate: 'subscribe_rss_feed_items',
      errorLabel: 'extracted.userProfileCollections.postsTopics.topicNewsSubscription_913cd611',
    })
    expect(USER_RELATION_ACTIONS.community.proxyMuted).toMatchObject({
      entityType: 'community',
      predicate: 'proxy_mute',
      inactiveLabel: 'extracted.userProfileCollections.communities.proxyMute_59134c33',
    })
  })
})
