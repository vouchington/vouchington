/**
 * Bookmark route config data for user relation pages (following, followers, muted, blocked, subscriptions).
 * Imported by bookmark-route-config-data.ts — do not import this directly.
 */
import type { BookmarkRouteConfig } from './bookmark-route-configs'

export const bookmarkRouteConfigDataUsers = {
  'users/following': {
    family: 'following' as const,
    path: '/my/users/following',
    title: 'extracted.lib.bookmarkRouteConfigData.myFollowedUsers_7002bd47',
    description: 'extracted.lib.bookmarkRouteConfigData.usersYouAreFollowing_75a2452c',
    breadcrumb: { name: 'extracted.lib.bookmarkRouteConfigData.users_6b0cc904', path: '/users' },
  },
  'users/followers': {
    family: null,
    path: '/my/users/followers',
    title: 'extracted.lib.bookmarkRouteConfigData.myFollowers_a44b1763',
    description: 'extracted.lib.bookmarkRouteConfigData.usersFollowingYou_18f81f7e',
    breadcrumb: { name: 'extracted.lib.bookmarkRouteConfigData.users_6b0cc904', path: '/users' },
  },
  'users/muted': {
    family: 'muted' as const,
    path: '/my/users/muted',
    title: 'extracted.lib.bookmarkRouteConfigData.myMutedUsers_46f0d349',
    description: 'extracted.lib.bookmarkRouteConfigData.usersYouHaveMuted_79dfdc20',
    breadcrumb: { name: 'extracted.lib.bookmarkRouteConfigData.users_6b0cc904', path: '/users' },
  },
  'users/blocked': {
    family: 'blocked' as const,
    path: '/my/users/blocked',
    title: 'extracted.lib.bookmarkRouteConfigData.myBlockedUsers_55b1266d',
    description: 'extracted.lib.bookmarkRouteConfigData.usersYouHaveBlocked_91fefd56',
    breadcrumb: { name: 'extracted.lib.bookmarkRouteConfigData.users_6b0cc904', path: '/users' },
  },
  'users/subscribed-posts': {
    family: 'subscribed' as const,
    path: '/my/users/subscribed-posts',
    title: 'extracted.lib.bookmarkRouteConfigData.myUserPostSubscriptions_69362b18',
    description: 'extracted.lib.bookmarkRouteConfigData.usersWhosePostsYouAreSubscribed_a2327d4e',
    breadcrumb: { name: 'extracted.lib.bookmarkRouteConfigData.users_6b0cc904', path: '/users' },
  },
} satisfies Record<string, BookmarkRouteConfig>
