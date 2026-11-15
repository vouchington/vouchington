import { type EmailTranslator, Button, Section, Text } from '@vouchington/email'

import { borderRadius, colors, styles } from './styles.mts'
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

const card = {
  backgroundColor: colors.muted,
  border: `1px solid ${colors.border}`,
  borderRadius,
  padding: '16px',
  margin: '12px 0',
}

const cardHeading = {
  fontSize: '14px',
  fontWeight: 'bold',
  margin: '0 0 6px 0',
  color: colors.foreground,
}

const statLine = {
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0',
  color: colors.foreground,
}

const statLabel = {
  color: colors.mutedFg,
}

const digestHeading = {
  fontSize: '11px',
  fontWeight: 'bold',
  margin: '10px 0 4px 0',
  color: colors.mutedFg,
  textTransform: 'uppercase' as const,
}

export function CommunityModerationSummaryCard({
  community,
  t,
}: {
  community: Community
  t: EmailTranslator
}) {
  return (
    <Section style={card}>
      <Text style={cardHeading}>{community.name}</Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${t('pendingPostReviews')}:`}</strong>{' '}
        {displayCount(community.pendingPostReviews, t)}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${t('pendingApplications')}:`}</strong>{' '}
        {displayCount(community.pendingApplications, t)}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${t('pendingReports')}:`}</strong>{' '}
        {displayCount(community.pendingReports, t)}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${t('escalatedItems')}:`}</strong>{' '}
        {displayCount(community.escalatedItems, t)}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${t('suspectedBanEvaders')}:`}</strong>{' '}
        {displayCount(community.suspectedBanEvaders, t)}
      </Text>
      <Text style={digestHeading}>{t('activityHeading')}</Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${t('memberChange')}:`}</strong>{' '}
        {displayMemberChange(community, t)}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${t('totalActiveMembers')}:`}</strong>{' '}
        {displayCount(community.totalActiveMembers, t)}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${t('newDiscussions')}:`}</strong>{' '}
        {displayCount(community.newDiscussionPosts, t)}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${t('newReviews')}:`}</strong>{' '}
        {displayCount(community.newReviewPosts, t)}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${t('newDataPoints')}:`}</strong>{' '}
        {displayCount(community.newDataPointPosts, t)}
      </Text>
      {community.topDiscussionTitle !== null ? (
        <Text style={statLine}>
          <strong style={statLabel}>{`${t('topDiscussion')}:`}</strong>{' '}
          {`${community.topDiscussionTitle} (${displayTopDiscussionReplies(community.topDiscussionReplyCount, t)})`}
        </Text>
      ) : null}
      <Text style={statLine}>
        <strong style={statLabel}>{`${t('activeMembers')}:`}</strong>{' '}
        {community.activeMemberRate === null
          ? displayCount(community.activeMemberCount, t)
          : `${displayCount(community.activeMemberCount, t)} (${Math.round(community.activeMemberRate * 100)}%)`}
      </Text>
      <Section style={styles.buttonContainer}>
        <Button
          href={community.url}
          style={styles.secondaryButton}
        >
          {t('itemButton')}
        </Button>
      </Section>
    </Section>
  )
}
