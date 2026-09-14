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
import { emailCopy, emailOptional } from './catalog-copy.mts'
import { CommunityModerationSummaryCard } from './community-moderation-summary-card.tsx'
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
    const t = emailCopy(locale, 'community-moderation-summary')
    const dateVars = { date: generatedForDate }
    return (
      <Html>
        <Head />
        <Preview>{t('preview', dateVars)}</Preview>
        <Body style={styles.main}>
          <Container style={styles.container}>
            <VouchaHeader />
            <Section style={styles.section}>
              <Text style={styles.heading}>{t('heading')}</Text>
              <Text style={styles.paragraph}>
                {`${emailOptional(t, 'greeting', userName)} ${t('body', dateVars)}`}
              </Text>

              {communities.length > 0 ? (
                communities.map(community => (
                  <CommunityModerationSummaryCard
                    key={community.url}
                    community={community}
                    t={t}
                  />
                ))
              ) : (
                <Text style={styles.paragraph}>{t('empty')}</Text>
              )}

              <Section style={styles.buttonContainer}>
                <Button
                  href={settingsUrl}
                  style={styles.button}
                >
                  {t('settings')}
                </Button>
              </Section>

              <Text style={styles.paragraph}>
                <Link
                  href={unsubscribeUrl}
                  style={settingsLink}
                >
                  {t('unsubscribe')}
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
  const t = emailCopy(locale, 'community-moderation-summary')
  const dateVars = { date: props.generatedForDate }
  const communitySummaries = props.communities.flatMap(community => [
    community.name,
    `${t('pendingPostReviews')}: ${community.pendingPostReviews}`,
    `${t('pendingApplications')}: ${community.pendingApplications}`,
    `${t('pendingReports')}: ${community.pendingReports}`,
    `${t('escalatedItems')}: ${community.escalatedItems}`,
    `${t('suspectedBanEvaders')}: ${community.suspectedBanEvaders}`,
    t('activityHeading'),
    `${t('memberChange')}: ${community.netMemberChange > 0 ? `+${community.netMemberChange}` : community.netMemberChange}`,
    `${t('totalActiveMembers')}: ${community.totalActiveMembers}`,
    `${t('newDiscussions')}: ${community.newDiscussionPosts}`,
    `${t('newReviews')}: ${community.newReviewPosts}`,
    `${t('newDataPoints')}: ${community.newDataPointPosts}`,
    ...(community.topDiscussionTitle !== null
      ? [
          `${t('topDiscussion')}: ${community.topDiscussionTitle} (${t('topDiscussionReplies', { count: community.topDiscussionReplyCount })})`,
        ]
      : []),
    `${t('activeMembers')}: ${community.activeMemberCount} (${Math.round(community.activeMemberRate * 100)}%)`,
    `${t('itemButton')}: ${community.url}`,
    '',
  ])

  return {
    subject: t('subject', dateVars),
    html: await render(<CommunityModerationSummaryEmail {...props} />, { pretty: true }),
    text: [
      emailOptional(t, 'greeting', props.userName),
      '',
      t('bodyText', dateVars),
      '',
      ...communitySummaries,
      `${t('settings')}: ${props.settingsUrl}`,
      '',
      getLocalizedSignoff(locale),
      '',
      `${t('unsubscribe')}: ${props.unsubscribeUrl}`,
      '',
      props.physicalAddress,
    ].join('\n'),
  }
}

const RenderableCommunityModerationSummaryEmail = Object.assign(CommunityModerationSummaryEmail, {
  render: renderCommunityModerationSummaryEmail,
})
export default RenderableCommunityModerationSummaryEmail
