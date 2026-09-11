import { Button, Section, Text } from './react-email-runtime.mts'
import type { communityModerationSummaryCopyByLocale } from './community-moderation-summary-copy.mts'
import { borderRadius, colors, styles } from './styles.mts'
import type { CommunityModerationSummaryEmailProps } from './types.mts'

type Community = CommunityModerationSummaryEmailProps['communities'][number]
type CommunityModerationSummaryCopy =
  (typeof communityModerationSummaryCopyByLocale)[keyof typeof communityModerationSummaryCopyByLocale]

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
  copy,
}: {
  community: Community
  copy: CommunityModerationSummaryCopy
}) {
  return (
    <Section style={card}>
      <Text style={cardHeading}>{community.name}</Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${copy.pendingPostReviews}:`}</strong>{' '}
        {community.pendingPostReviews}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${copy.pendingApplications}:`}</strong>{' '}
        {community.pendingApplications}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${copy.pendingReports}:`}</strong> {community.pendingReports}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${copy.escalatedItems}:`}</strong> {community.escalatedItems}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${copy.suspectedBanEvaders}:`}</strong>{' '}
        {community.suspectedBanEvaders}
      </Text>
      <Text style={digestHeading}>{copy.activityHeading}</Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${copy.memberChange}:`}</strong>{' '}
        {community.netMemberChange > 0
          ? `+${community.netMemberChange}`
          : community.netMemberChange}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${copy.totalActiveMembers}:`}</strong>{' '}
        {community.totalActiveMembers}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${copy.newDiscussions}:`}</strong>{' '}
        {community.newDiscussionPosts}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${copy.newReviews}:`}</strong> {community.newReviewPosts}
      </Text>
      <Text style={statLine}>
        <strong style={statLabel}>{`${copy.newDataPoints}:`}</strong> {community.newDataPointPosts}
      </Text>
      {community.topDiscussionTitle !== null ? (
        <Text style={statLine}>
          <strong style={statLabel}>{`${copy.topDiscussion}:`}</strong>{' '}
          {`${community.topDiscussionTitle} (${copy.topDiscussionReplies(community.topDiscussionReplyCount)})`}
        </Text>
      ) : null}
      <Text style={statLine}>
        <strong style={statLabel}>{`${copy.activeMembers}:`}</strong>{' '}
        {`${community.activeMemberCount} (${Math.round(community.activeMemberRate * 100)}%)`}
      </Text>
      <Section style={styles.buttonContainer}>
        <Button
          href={community.url}
          style={styles.secondaryButton}
        >
          {copy.itemButton}
        </Button>
      </Section>
    </Section>
  )
}
