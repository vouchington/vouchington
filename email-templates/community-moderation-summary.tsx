import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Text,
  render,
} from './react-email-runtime.mts'
import { CommunityModerationSummaryCard } from './community-moderation-summary-card.tsx'
import { communityModerationSummaryCopyByLocale } from './community-moderation-summary-copy.mts'
import { MarketingFooter, VouchaHeader } from './components.tsx'
import { getLocalizedSignoff, resolveUiLocale } from './locale.mts'
import { colors, styles } from './styles.mts'
import type {
  CommunityModerationSummaryEmailProps,
  EmailRenderResultPromise,
  PreviewableEmailComponent,
} from './types.mts'

const settingsLink = {
  color: colors.primary,
  textDecoration: 'underline',
}

const CommunityModerationSummaryEmail: PreviewableEmailComponent<
  CommunityModerationSummaryEmailProps
> = ({
  userName,
  generatedForDate,
  settingsUrl,
  unsubscribeUrl,
  physicalAddress,
  communities,
  uiLocale,
}) =>
  (() => {
    const locale = resolveUiLocale(uiLocale)
    const copy = communityModerationSummaryCopyByLocale[locale]
    return (
      <Html>
        <Head />
        <Preview>{copy.preview.replace('{date}', generatedForDate)}</Preview>
        <Body style={styles.main}>
          <Container style={styles.container}>
            <VouchaHeader />
            <Section style={styles.section}>
              <Text style={styles.heading}>{copy.heading}</Text>
              <Text style={styles.paragraph}>
                {`${copy.greeting(userName)} ${copy.body.replace('{date}', generatedForDate)}`}
              </Text>

              {communities.length > 0 ? (
                communities.map(community => (
                  <CommunityModerationSummaryCard
                    key={community.url}
                    community={community}
                    copy={copy}
                  />
                ))
              ) : (
                <Text style={styles.paragraph}>{copy.empty}</Text>
              )}

              <Section style={styles.buttonContainer}>
                <Button
                  href={settingsUrl}
                  style={styles.button}
                >
                  {copy.settings}
                </Button>
              </Section>

              <Text style={styles.paragraph}>
                <Link
                  href={unsubscribeUrl}
                  style={settingsLink}
                >
                  {copy.unsubscribe}
                </Link>
              </Text>
            </Section>
            <MarketingFooter
              uiLocale={locale}
              physicalAddress={physicalAddress}
            />
          </Container>
        </Body>
      </Html>
    )
  })()

CommunityModerationSummaryEmail.PreviewProps = {
  userName: 'Alex',
  generatedForDate: 'July 9, 2026',
  settingsUrl: 'https://voucha.ai/my/notification-settings',
  unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
  physicalAddress: '123 Placeholder St, Suite 100, San Francisco, CA 94105',
  communities: [
    {
      name: 'Travel Hackers',
      url: 'https://voucha.ai/communities/travel-hackers',
      pendingPostReviews: 2,
      pendingApplications: 1,
      pendingReports: 3,
      escalatedItems: 1,
      suspectedBanEvaders: 0,
      netMemberChange: 5,
      totalActiveMembers: 128,
      newDiscussionPosts: 4,
      newReviewPosts: 2,
      newDataPointPosts: 1,
      topDiscussionTitle: 'Best credit card for a Japan trip?',
      topDiscussionReplyCount: 12,
      activeMemberCount: 41,
      activeMemberRate: 0.32,
    },
    {
      name: 'Card Pros',
      url: 'https://voucha.ai/communities/card-pros',
      pendingPostReviews: 0,
      pendingApplications: 4,
      pendingReports: 1,
      escalatedItems: 0,
      suspectedBanEvaders: 2,
      netMemberChange: -1,
      totalActiveMembers: 64,
      newDiscussionPosts: 0,
      newReviewPosts: 0,
      newDataPointPosts: 0,
      topDiscussionTitle: null,
      topDiscussionReplyCount: 0,
      activeMemberCount: 6,
      activeMemberRate: 0.09,
    },
  ],
}

async function renderCommunityModerationSummaryEmail(
  props: CommunityModerationSummaryEmailProps,
): EmailRenderResultPromise {
  const locale = resolveUiLocale(props.uiLocale)
  const copy = communityModerationSummaryCopyByLocale[locale]
  const communitySummaries = props.communities.flatMap(community => [
    community.name,
    `${copy.pendingPostReviews}: ${community.pendingPostReviews}`,
    `${copy.pendingApplications}: ${community.pendingApplications}`,
    `${copy.pendingReports}: ${community.pendingReports}`,
    `${copy.escalatedItems}: ${community.escalatedItems}`,
    `${copy.suspectedBanEvaders}: ${community.suspectedBanEvaders}`,
    copy.activityHeading,
    `${copy.memberChange}: ${community.netMemberChange > 0 ? `+${community.netMemberChange}` : community.netMemberChange}`,
    `${copy.totalActiveMembers}: ${community.totalActiveMembers}`,
    `${copy.newDiscussions}: ${community.newDiscussionPosts}`,
    `${copy.newReviews}: ${community.newReviewPosts}`,
    `${copy.newDataPoints}: ${community.newDataPointPosts}`,
    ...(community.topDiscussionTitle !== null
      ? [
          `${copy.topDiscussion}: ${community.topDiscussionTitle} (${copy.topDiscussionReplies(community.topDiscussionReplyCount)})`,
        ]
      : []),
    `${copy.activeMembers}: ${community.activeMemberCount} (${Math.round(community.activeMemberRate * 100)}%)`,
    `${copy.itemButton}: ${community.url}`,
    '',
  ])

  return {
    subject: copy.subject.replace('{date}', props.generatedForDate),
    html: await render(<CommunityModerationSummaryEmail {...props} />, { pretty: true }),
    text: [
      copy.greeting(props.userName),
      '',
      copy.bodyText.replace('{date}', props.generatedForDate),
      '',
      ...communitySummaries,
      `${copy.settings}: ${props.settingsUrl}`,
      '',
      getLocalizedSignoff(locale),
      '',
      `${copy.unsubscribe}: ${props.unsubscribeUrl}`,
      '',
      props.physicalAddress,
    ].join('\n'),
  }
}

const RenderableCommunityModerationSummaryEmail = Object.assign(CommunityModerationSummaryEmail, {
  render: renderCommunityModerationSummaryEmail,
})
export default RenderableCommunityModerationSummaryEmail
