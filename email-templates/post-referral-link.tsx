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
import { MarketingFooter, VouchaHeader } from './components.tsx'
import { postReferralLinkCopyByLocale } from './post-referral-link-copy.mts'
import { getLocalizedSignoff, resolveUiLocale } from './locale.mts'
import { borderRadius, colors, styles } from './styles.mts'
import type {
  EmailRenderResultPromise,
  PostReferralLinkEmailProps,
  PreviewableEmailComponent,
} from './types.mts'

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

const cardText = {
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0 0 12px 0',
  color: colors.mutedFg,
}

const itemButton = {
  ...styles.secondaryButton,
  display: 'inline-block' as const,
}

const linkStyle = {
  color: colors.primary,
  textDecoration: 'underline',
}

function formatLinkCount(
  copy: (typeof postReferralLinkCopyByLocale)[keyof typeof postReferralLinkCopyByLocale],
  linkCount?: number,
): string {
  return linkCount === undefined ? copy.fallbackCount : copy.activeLinks(linkCount)
}

const PostReferralLinkEmail: PreviewableEmailComponent<PostReferralLinkEmailProps> = ({
  userName,
  referralPrograms,
  settingsUrl,
  unsubscribeUrl,
  physicalAddress,
  uiLocale,
}) =>
  (() => {
    const locale = resolveUiLocale(uiLocale)
    const copy = postReferralLinkCopyByLocale[locale]
    return (
      <Html>
        <Head />
        <Preview>{copy.preview}</Preview>
        <Body style={styles.main}>
          <Container style={styles.container}>
            <VouchaHeader />
            <Section style={styles.section}>
              <Text style={styles.heading}>{copy.heading}</Text>
              <Text style={styles.paragraph}>{`${copy.greeting(userName)} ${copy.body}`}</Text>

              {referralPrograms.length > 0 ? (
                referralPrograms.map(program => (
                  <Section
                    key={program.url}
                    style={card}
                  >
                    <Text style={cardHeading}>{program.name}</Text>
                    <Text style={cardText}>{formatLinkCount(copy, program.linkCount)}</Text>
                    <Button
                      href={program.url}
                      style={itemButton}
                    >
                      {copy.itemButton}
                    </Button>
                  </Section>
                ))
              ) : (
                <Text style={styles.paragraph}>{copy.empty}</Text>
              )}

              <Section style={styles.buttonContainer}>
                <Button
                  href={settingsUrl}
                  style={styles.button}
                >
                  {copy.manage}
                </Button>
              </Section>

              <Text style={styles.paragraph}>
                <Link
                  href={unsubscribeUrl}
                  style={linkStyle}
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

PostReferralLinkEmail.PreviewProps = {
  userName: 'Alex',
  referralPrograms: [
    {
      name: 'Travel Cards',
      url: 'https://voucha.ai/referral-programs/travel-cards',
      linkCount: 3,
    },
    {
      name: 'Food Delivery',
      url: 'https://voucha.ai/referral-programs/food-delivery',
      linkCount: 1,
    },
  ],
  settingsUrl: 'https://voucha.ai/my/landing-pages',
  unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
  physicalAddress: '123 Placeholder St, Suite 100, San Francisco, CA 94105',
}

async function renderPostReferralLinkEmail(
  props: PostReferralLinkEmailProps,
): EmailRenderResultPromise {
  const locale = resolveUiLocale(props.uiLocale)
  const copy = postReferralLinkCopyByLocale[locale]
  return {
    subject: copy.subject,
    html: await render(<PostReferralLinkEmail {...props} />, { pretty: true }),
    text: [
      copy.greeting(props.userName),
      '',
      copy.bodyText,
      '',
      ...props.referralPrograms.flatMap(program => [
        program.name,
        formatLinkCount(copy, program.linkCount),
        `${copy.itemButton}: ${program.url}`,
        '',
      ]),
      `${copy.manage}: ${props.settingsUrl}`,
      '',
      `${copy.unsubscribe}: ${props.unsubscribeUrl}`,
      '',
      getLocalizedSignoff(locale),
      '',
      props.physicalAddress,
    ].join('\n'),
  }
}

const RenderablePostReferralLinkEmail = Object.assign(PostReferralLinkEmail, {
  render: renderPostReferralLinkEmail,
})
export default RenderablePostReferralLinkEmail
