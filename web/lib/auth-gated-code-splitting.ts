export interface LazyImportExpectation {
  file: string
  modulePath: string
  exportName?: string
}

export const lazyImportExpectations: LazyImportExpectation[] = [
  {
    file: 'web/components/topics/topic-detail-header.tsx',
    modulePath: '@/components/shared/follow-button',
    exportName: 'FollowButton',
  },
  {
    file: 'web/components/users/user-profile-header.tsx',
    modulePath: '@/components/shared/follow-button',
    exportName: 'FollowButton',
  },
  {
    file: 'web/components/topics/topic-route-asides.tsx',
    modulePath: './topic-actions-aside',
    exportName: 'TopicActionsAside',
  },
  {
    file: 'web/components/users/user-detail-layout.tsx',
    modulePath: './user-actions-aside',
    exportName: 'UserActionsAside',
  },
  {
    file: 'web/components/communities/community-header.tsx',
    modulePath: './join-button',
  },
  {
    file: 'web/components/home/trending-feeds.tsx',
    modulePath: '@/components/shared/follow-button',
    exportName: 'FollowButton',
  },
  {
    file: 'web/components/posts/post-card.tsx',
    modulePath: '@/components/shared/follower-share-actions',
    exportName: 'FollowerShareActions',
  },
  {
    // post-detail.tsx now bundles share/send/report/edit/delete/lock behind the overflow menu;
    // FollowerShareActions is no longer imported here — it lives in post-card, news-item-card, etc.
    file: 'web/components/posts/post-detail-overflow-lazy.tsx',
    modulePath: './post-detail-overflow-menu',
    exportName: 'PostDetailOverflowMenu',
  },
  {
    file: 'web/components/posts/post-detail-actions.tsx',
    modulePath: '@/components/shared/entity-bookmark-button',
    exportName: 'EntityBookmarkButton',
  },
  {
    file: 'web/components/feed/news-item-card.tsx',
    modulePath: '@/components/shared/follower-share-actions',
    exportName: 'FollowerShareActions',
  },
  {
    file: 'web/app/(growth)/growth/page.tsx',
    modulePath: '@/components/admin/growth/growth-dashboard',
  },
  {
    file: 'web/app/topic-recommendations/page.tsx',
    modulePath: '@/components/topic-recommendations/topic-recommendations-table',
    exportName: 'TopicRecommendationsTable',
  },
]
