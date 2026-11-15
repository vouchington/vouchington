import {
  emailOptional,
  type EmailRenderResultPromise,
  type PreviewableEmailComponent,
  resolveEmailLocale,
  Body,
  Button,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Text,
  renderEmail as renderTemplateEmail,
} from '@vouchington/email'

import { SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE } from '@ts-shared/languages/ui-locales'

import { emailCopy } from './catalog-copy.mts'
import { CommunityModerationSummaryCard } from './community-moderation-summary-card.tsx'
import {
  renderCommunityModerationSummaryText,
  remainingCommunitiesCopy,
} from './community-moderation-summary-text.mts'
import { MarketingFooter, VouchaHeader } from './components.tsx'
import { colors, styles } from './styles.mts'
import type { CommunityModerationSummaryEmailProps } from './types.mts'

const CommunityModerationSummaryEmail: PreviewableEmailComponent<
  CommunityModerationSummaryEmailProps
> = ({
  userName,
  generatedForDate,
  settingsUrl,
  unsubscribeUrl,
  physicalAddress,
  communities,
  remainingCommunityCount,
  uiLocale,
}) =>
  (() => {
    const locale = resolveEmailLocale(uiLocale, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE)
    const t = emailCopy(locale, 'community-moderation-summary')
    const dateVars = { date: generatedForDate }
    return (
      <Html lang={locale}>
        <Head />
        <Preview>{t('preview', dateVars)}</Preview>
        <Body
          lang={locale}
          style={styles.main}
        >
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
                    key={community.communityId}
                    community={community}
                    t={t}
                  />
                ))
              ) : (
                <Text style={styles.paragraph}>{t('empty')}</Text>
              )}

              {remainingCommunityCount > 0 ? (
                <Text style={styles.paragraph}>
                  {remainingCommunitiesCopy(remainingCommunityCount, t)}
                </Text>
              ) : null}

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
                  style={{ color: colors.primary, textDecoration: 'underline' }}
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
      communityId: 'travel-hackers',
      name: 'Travel Hackers',
      url: 'https://voucha.ai/communities/travel-hackers/settings/moderation',
      pendingPostReviews: 2,
      pendingApplications: 1,
      pendingReports: 3,
      escalatedItems: 1,
      suspectedBanEvaders: 0,
      newMembers: 7,
      departedMembers: 2,
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
      communityId: 'card-pros',
      name: 'Card Pros',
      url: 'https://voucha.ai/communities/card-pros/settings/moderation',
      pendingPostReviews: 0,
      pendingApplications: 4,
      pendingReports: 1,
      escalatedItems: 0,
      suspectedBanEvaders: 2,
      newMembers: 1,
      departedMembers: 2,
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
  remainingCommunityCount: 0,
}

async function renderCommunityModerationSummaryEmail(
  props: CommunityModerationSummaryEmailProps,
): EmailRenderResultPromise {
  const locale = resolveEmailLocale(props.uiLocale, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE)
  const t = emailCopy(locale, 'community-moderation-summary')
  return renderTemplateEmail({
    subject: t('subject', { date: props.generatedForDate }),
    element: <CommunityModerationSummaryEmail {...props} />,
    pretty: true,
    text: renderCommunityModerationSummaryText(props, t, locale),
  })
}

const RenderableCommunityModerationSummaryEmail = Object.assign(CommunityModerationSummaryEmail, {
  render: renderCommunityModerationSummaryEmail,
})
export default RenderableCommunityModerationSummaryEmail
