import type { MessageKey } from '@ts-shared/ui-messages'
import { isActivePath } from '@/lib/utils/path'
import type {
  CommunityMember,
  CommunityMemberRole,
  CommunityVisibility,
} from '@/types/api-responses'

export interface CommunityNavTab {
  name: string
  label: MessageKey
  path: string
  dropdownItems?: CommunityNavTab[]
}

interface BuildCommunityNavTabsParams {
  base: string
  visibility: CommunityVisibility
  newsEnabled: boolean
  membership?: CommunityMember | null
  currentUserRole?: CommunityMemberRole | null
  hasPendingApplication?: boolean
}

export function buildCommunityNavTabs({
  base,
  visibility,
  newsEnabled,
  membership,
  currentUserRole,
  hasPendingApplication,
}: BuildCommunityNavTabsParams): CommunityNavTab[] {
  const isMember = membership != null && membership.removed_at == null
  const isMod = currentUserRole === 'owner' || currentUserRole === 'moderator'

  const listItems: CommunityNavTab[] = [
    {
      name: 'lists-topics',
      label: 'extracted.communities.communityNav.topics_e22820fc',
      path: `${base}/lists/topics`,
    },
    {
      name: 'lists-sources',
      label: 'extracted.communities.communityNav.sources_caf85b08',
      path: `${base}/lists/feeds`,
    },
    {
      name: 'lists-posts',
      label: 'extracted.communities.communityNav.posts_a80811cf',
      path: `${base}/lists/posts`,
    },
    {
      name: 'lists-domains',
      label: 'extracted.communities.communityNav.domains_ced67718',
      path: `${base}/lists/domains`,
    },
    {
      name: 'lists-urls',
      label: 'extracted.communities.communityNav.urls_1240054e',
      path: `${base}/lists/urls`,
    },
  ]

  const moderationDropdownItems: CommunityNavTab[] = [
    {
      name: 'moderation-reports',
      label: 'extracted.communities.communityNav.reports_dacca3cb',
      path: `${base}/settings/moderation`,
    },
    {
      name: 'modlog',
      label: 'extracted.communities.communityNav.modLog_7d4b507b',
      path: `${base}/settings/modlog`,
    },
    {
      name: 'moderation-analytics',
      label: 'extracted.communities.communityNav.analytics_94c116ee',
      path: `${base}/settings/moderation/analytics`,
    },
    {
      name: 'pinned-posts',
      label: 'extracted.communities.communityNav.pinnedPosts_b9f4e733',
      path: `${base}/settings/pinned-posts`,
    },
  ]

  const tabs: CommunityNavTab[] = [
    { name: 'posts', label: 'extracted.communities.communityNav.posts_a80811cf', path: base },
  ]

  if (!hasPendingApplication) {
    if (newsEnabled) {
      tabs.push({
        name: 'news',
        label: 'extracted.communities.communityNav.news_69752f23',
        path: `${base}/news`,
      })
    }

    tabs.push(
      {
        name: 'lists',
        label: 'extracted.communities.communityNav.lists_308d5a09',
        path: `${base}/lists`,
        dropdownItems: listItems,
      },
      {
        name: 'members',
        label: 'extracted.communities.communityNav.members_1044a4c0',
        path: `${base}/members`,
      },
    )

    if (isMember && !isMod) {
      tabs.push({
        name: 'moderation-transparency',
        label:
          'extracted.moderationAnalytics.moderationTransparencyPanel.moderationTransparency_0e1d33a9',
        path: `${base}/settings/moderation/analytics`,
      })
    }
  }

  if (!isMember && visibility === 'private') {
    tabs.push({
      name: 'apply',
      label: hasPendingApplication
        ? 'extracted.communities.communityNav.applicationPending_07bf3b11'
        : 'extracted.communities.communityNav.apply_31e392d1',
      path: `${base}/apply`,
    })
  }

  if (currentUserRole === 'owner') {
    tabs.push({
      name: 'settings',
      label: 'extracted.communities.communityNav.settings_74a883a0',
      path: `${base}/settings`,
    })
  }

  if (isMod) {
    tabs.push({
      name: 'moderation',
      label: 'extracted.communities.communityNav.moderation_126d4415',
      path: `${base}/settings/moderation`,
      dropdownItems: moderationDropdownItems,
    })
  }

  return tabs
}

export function isCommunityNavTabActive(
  tab: CommunityNavTab,
  pathname: string,
  base: string,
): boolean {
  if (tab.dropdownItems?.some(item => isActivePath(pathname, item.path))) return true
  if (tab.name === 'posts') return pathname === base || isActivePath(pathname, `${base}/posts`)
  if (tab.name === 'settings')
    return pathname === `${base}/settings` || isActivePath(pathname, `${base}/settings/invites`)
  if (tab.name === 'moderation')
    return (
      pathname === `${base}/settings/moderation` ||
      isActivePath(pathname, `${base}/settings/applications`)
    )
  return isActivePath(pathname, tab.path)
}
