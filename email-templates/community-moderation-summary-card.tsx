import { Button, Section, Text } from './react-email-runtime.mts'
import type { EmailTranslator } from './catalog-copy.mts'
import { borderRadius, colors, styles } from './styles.mts'
import type { CommunityModerationSummaryEmailProps } from './types.mts'

type Community = CommunityModerationSummaryEmailProps['communities'][number]

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
        {community.pendingPostReviews}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${t('pendingApplications')}:`}</strong>{' '}
        {community.pendingApplications}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${t('pendingReports')}:`}</strong> {community.pendingReports}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${t('escalatedItems')}:`}</strong> {community.escalatedItems}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${t('suspectedBanEvaders')}:`}</strong>{' '}
        {community.suspectedBanEvaders}
      </Text>
      <Text style={digestHeading}>{t('activityHeading')}</Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${t('memberChange')}:`}</strong>{' '}
        {community.netMemberChange > 0
          ? `+${community.netMemberChange}`
          : community.netMemberChange}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${t('totalActiveMembers')}:`}</strong>{' '}
        {community.totalActiveMembers}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${t('newDiscussions')}:`}</strong>{' '}
        {community.newDiscussionPosts}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${t('newReviews')}:`}</strong> {community.newReviewPosts}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${t('newDataPoints')}:`}</strong> {community.newDataPointPosts}
      </Text>
      {community.topDiscussionTitle !== null ? (
        <Text style={statLine}>
          <strong style={statLabel}>{`${t('topDiscussion')}:`}</strong>{' '}
          {`${community.topDiscussionTitle} (${t('topDiscussionReplies', { count: community.topDiscussionReplyCount })})`}
        </Text>
      ) : null}
      <Text style={statLine}>
        <strong style={statLabel}>{`${t('activeMembers')}:`}</strong>{' '}
        {`${community.activeMemberCount} (${Math.round(community.activeMemberRate * 100)}%)`}
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
