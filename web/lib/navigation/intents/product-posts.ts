import { FileText } from 'lucide-react'

import type { NavIntent } from './types'

export const POSTS_INTENT: NavIntent = {
  id: 'posts',
  label: 'extracted.intents.productPosts.posts_a80811cf',
  icon: FileText,
  groups: [
    {
      label: 'extracted.intents.productPosts.browse_3227aa96',
      dataPw: 'sidebar-group-browse',
      items: [
        {
          label: 'extracted.intents.productPosts.myPostsFeed_a1ed6e47',
          href: '/feed/posts',
          dataPw: 'sidebar-nav-your-posts',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productPosts.stories_6d09cf57',
          href: '/stories',
          dataPw: 'sidebar-nav-stories',
        },
        {
          label: 'extracted.intents.productPosts.allPosts_0fae3f21',
          href: '/posts',
          dataPw: 'sidebar-nav-all-posts',
        },
        {
          label: 'extracted.intents.productPosts.discussions_60157cfc',
          href: '/discussions',
          dataPw: 'sidebar-nav-discussions',
        },
        {
          label: 'extracted.intents.productPosts.reviews_84cb7871',
          href: '/reviews',
          dataPw: 'sidebar-nav-reviews',
        },
        {
          label: 'extracted.intents.productPosts.dataPoints_1da65e3a',
          href: '/data-points',
          dataPw: 'sidebar-nav-data-points',
        },
        {
          label: 'extracted.intents.productPosts.links_9024c197',
          href: '/links',
          dataPw: 'sidebar-nav-links',
        },
        {
          label: 'extracted.intents.productPosts.articles_b14ac78a',
          href: '/articles',
          dataPw: 'sidebar-nav-articles',
        },
        {
          label: 'extracted.intents.productPosts.blog_8c6bc099',
          href: '/blog',
          dataPw: 'sidebar-nav-blog',
        },
      ],
    },
    {
      label: 'extracted.intents.productPosts.bookmarks_96316f0f',
      dataPw: 'sidebar-group-bookmarks',
      requiresAuth: true,
      items: [
        {
          label: 'extracted.intents.productPosts.savedPosts_2e550416',
          href: '/my/posts/saved',
          dataPw: 'sidebar-nav-my-posts-saved',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productPosts.hiddenPosts_b4330740',
          href: '/my/posts/hidden',
          dataPw: 'sidebar-nav-my-posts-hidden',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productPosts.followedPosts_f39d9e4e',
          href: '/my/posts/following',
          dataPw: 'sidebar-nav-my-posts-following',
          requiresAuth: true,
        },
        {
          label: 'extracted.intents.productPosts.subscribedToPosts_d21eed77',
          href: '/my/posts/subscribed',
          dataPw: 'sidebar-nav-my-posts-subscribed',
          requiresAuth: true,
        },
      ],
    },
    {
      label: 'extracted.intents.productPosts.admin_c1c224b0',
      dataPw: 'sidebar-group-admin',
      roles: ['administrator'] as const,
      items: [
        {
          label: 'extracted.intents.productPosts.curatedAsides_8798b0ff',
          href: '/curated-asides/topics',
          dataPw: 'sidebar-nav-curated-asides',
        },
      ],
    },
  ],
}
