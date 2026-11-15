import type { UiLocale } from '@ts-shared/languages/ui-locales'
import { emailOptional, type EmailTranslator } from '@vouchington/email'

import { getLocalizedSignoff } from './locale.mts'
import type { CommunityModerationSummaryEmailProps } from './types.mts'

type Community = CommunityModerationSummaryEmailProps['communities'][number]

function displayCount(count: number, t: EmailTranslator): string {
  return count >= 100 ? t('countCapped') : String(count)
}

function displayMemberChange(community: Community, t: EmailTranslator): string {
  if (community.netMemberChange === null) {
    return `${t('newMembers')}: ${displayCount(community.newMembers, t)}, ${t('departedMembers')}: ${displayCount(community.departedMembers, t)}`
  }
  if (community.netMemberChange >= 100) return `+${t('countCapped')}`
  if (community.netMemberChange <= -100) return `-${t('countCapped')}`
  return community.netMemberChange > 0
    ? `+${community.netMemberChange}`
    : String(community.netMemberChange)
}

function displayTopDiscussionReplies(count: number, t: EmailTranslator): string {
  return count >= 100 ? t('topDiscussionRepliesCapped') : t('topDiscussionReplies', { count })
}

export function remainingCommunitiesCopy(count: number, t: EmailTranslator): string {
  return count >= 100
    ? t('moreCommunitiesCapped', { count: t('countCapped') })
    : t('moreCommunities', { count })
}

export function renderCommunityModerationSummaryText(
  props: CommunityModerationSummaryEmailProps,
  t: EmailTranslator,
  locale: UiLocale,
): string {
  const dateVars = { date: props.generatedForDate }
  const communitySummaries = props.communities.flatMap(community => [
    community.name,
    `${t('pendingPostReviews')}: ${displayCount(community.pendingPostReviews, t)}`,
    `${t('pendingApplications')}: ${displayCount(community.pendingApplications, t)}`,
    `${t('pendingReports')}: ${displayCount(community.pendingReports, t)}`,
    `${t('escalatedItems')}: ${displayCount(community.escalatedItems, t)}`,
    `${t('suspectedBanEvaders')}: ${displayCount(community.suspectedBanEvaders, t)}`,
    t('activityHeading'),
    `${t('memberChange')}: ${displayMemberChange(community, t)}`,
    `${t('totalActiveMembers')}: ${displayCount(community.totalActiveMembers, t)}`,
    `${t('newDiscussions')}: ${displayCount(community.newDiscussionPosts, t)}`,
    `${t('newReviews')}: ${displayCount(community.newReviewPosts, t)}`,
    `${t('newDataPoints')}: ${displayCount(community.newDataPointPosts, t)}`,
    ...(community.topDiscussionTitle !== null
      ? [
          `${t('topDiscussion')}: ${community.topDiscussionTitle} (${displayTopDiscussionReplies(community.topDiscussionReplyCount, t)})`,
        ]
      : []),
    `${t('activeMembers')}: ${community.activeMemberRate === null ? displayCount(community.activeMemberCount, t) : `${displayCount(community.activeMemberCount, t)} (${Math.round(community.activeMemberRate * 100)}%)`}`,
    `${t('itemButton')}: ${community.url}`,
    '',
  ])

  return [
    emailOptional(t, 'greeting', props.userName),
    '',
    t('bodyText', dateVars),
    '',
    ...communitySummaries,
    ...(props.remainingCommunityCount > 0
      ? [remainingCommunitiesCopy(props.remainingCommunityCount, t), '']
      : []),
    `${t('settings')}: ${props.settingsUrl}`,
    '',
    getLocalizedSignoff(locale),
    '',
    `${t('unsubscribe')}: ${props.unsubscribeUrl}`,
    '',
    props.physicalAddress,
  ].join('\n')
}
