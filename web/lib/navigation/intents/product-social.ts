import { UserPlus, Users } from 'lucide-react'

import type { NavIntent } from './types'

export const COMMUNITIES_INTENT: NavIntent = {
  id: 'communities',
  label: 'extracted.intents.productSocial.communities_c864f329',
  icon: Users,
  groups: [
    {
      label: 'extracted.intents.productSocial.browse_3227aa96',
      dataPw: 'sidebar-group-browse',
      items: [
        {
          label: 'extracted.intents.productSocial.explore_3b73900b',
          href: '/communities',
          dataPw: 'sidebar-nav-explore',
        },
      ],
    },
    {
      label: 'extracted.intents.productSocial.bookmarks_96316f0f',
      dataPw: 'sidebar-group-bookmarks',
      requiresAuth: true,
      items: [
        {
          label: 'extracted.intents.productSocial.savedCommunities_0e48d499',
          href: '/my/communities/saved',
          dataPw: 'sidebar-nav-my-communities-saved',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productSocial.proxyFollowedCommunities_5d8b8c00',
          href: '/my/communities/proxy-following',
          dataPw: 'sidebar-nav-my-communities-proxy-following',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productSocial.proxyMutedCommunities_241f8699',
          href: '/my/communities/proxy-muted',
          dataPw: 'sidebar-nav-my-communities-proxy-muted',
          requiresAuth: true,
        },
      ],
    },
  ],
}

export const FRIENDS_INTENT: NavIntent = {
  id: 'friends',
  label: 'extracted.intents.productSocial.usersFriends_5291e860',
  icon: UserPlus,
  requiresAuth: true,
  groups: [
    {
      label: 'extracted.intents.productSocial.browse_3227aa96',
      dataPw: 'sidebar-group-browse',
      items: [
        {
          label: 'extracted.intents.productSocial.users_6b0cc904',
          href: '/users',
          dataPw: 'sidebar-nav-users',
        },
        {
          label: 'extracted.intents.productSocial.findFriends_d4864039',
          href: '/my/friend-recommendations',
          dataPw: 'sidebar-nav-find-friends',
        },
      ],
    },
    {
      label: 'extracted.intents.productSocial.bookmarks_96316f0f',
      dataPw: 'sidebar-group-bookmarks',
      requiresAuth: true,
      items: [
        {
          label: 'extracted.intents.productSocial.following_344b4271',
          href: '/my/users/following',
          dataPw: 'sidebar-nav-my-users-following',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productSocial.followers_a145ab34',
          href: '/my/users/followers',
          dataPw: 'sidebar-nav-my-users-followers',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productSocial.subscribedToPosts_d21eed77',
          href: '/my/users/subscribed-posts',
          dataPw: 'sidebar-nav-my-users-subscribed-posts',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productSocial.muted_2346f214',
          href: '/my/users/muted',
          dataPw: 'sidebar-nav-my-users-muted',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productSocial.blocked_18f2a094',
          href: '/my/users/blocked',
          dataPw: 'sidebar-nav-my-users-blocked',
          requiresAuth: true,
        },
      ],
    },
  ],
}
