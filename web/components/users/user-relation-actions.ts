import { USER_PROFILE_COLLECTIONS } from '@ts-shared/user-profile-collections'
import type { RelationManagementActionConfig } from './relation-management-action'

export const USER_RELATION_ACTIONS = {
  post: {
    saved: relation('post', 'saved'),
    hidden: relation('post', 'hidden'),
    following: relation('post', 'following'),
    subscribed: relation('post', 'subscribed'),
  },
  topic: {
    blocked: relation('topic', 'blocked'),
    muted: relation('topic', 'muted'),
    subscribedPosts: relation('topic', 'subscribedPosts'),
    subscribedNews: relation('topic', 'subscribedNews'),
    dismissed: relation('topic', 'dismissed'),
  },
  user: {
    blocked: relation('user', 'blocked'),
    muted: relation('user', 'muted'),
    subscribedPosts: relation('user', 'subscribedPosts'),
    dismissed: relation('user', 'dismissed'),
  },
  rssFeed: {
    following: relation('rssFeed', 'following'),
    subscribed: relation('rssFeed', 'subscribed'),
    muted: relation('rssFeed', 'muted'),
  },
  rssFeedItem: {
    saved: relation('rssFeedItem', 'saved'),
    hidden: relation('rssFeedItem', 'hidden'),
  },
  url: {
    saved: relation('url', 'saved'),
  },
  domain: {
    blocked: relation('domain', 'blocked'),
    muted: relation('domain', 'muted'),
  },
  community: {
    saved: relation('community', 'saved'),
    proxyFollowing: relation('community', 'proxyFollowing'),
    proxyMuted: relation('community', 'proxyMuted'),
  },
} as const

function relation(
  group: NonNullable<(typeof USER_PROFILE_COLLECTIONS)[number]['action']>['group'],
  key: string,
): RelationManagementActionConfig {
  const action = USER_PROFILE_COLLECTIONS.find(
    collection => collection.action?.group === group && collection.action.key === key,
  )?.action

  if (!action) {
    throw new Error(`Missing user profile relation action ${group}.${key}`)
  }

  return {
    entityType: action.entityType,
    predicate: action.predicate,
    activeLabel: action.activeLabel,
    inactiveLabel: action.inactiveLabel,
    errorLabel: action.errorLabel,
  }
}
