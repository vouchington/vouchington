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
import { followTopicsCopyByLocale } from './follow-topics-copy.mts'
import { getLocalizedSignoff, resolveUiLocale } from './locale.mts'
import { borderRadius, colors, styles } from './styles.mts'
import type {
  EmailRenderResultPromise,
  FollowTopicsEmailProps,
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

const settingsLink = {
  color: colors.primary,
  textDecoration: 'underline',
}

const FollowTopicsEmail: PreviewableEmailComponent<FollowTopicsEmailProps> = ({
  userName,
  topics,
  settingsUrl,
  unsubscribeUrl,
  physicalAddress,
  uiLocale,
}) =>
  (() => {
    const locale = resolveUiLocale(uiLocale)
    const copy = followTopicsCopyByLocale[locale]
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

              {topics.length > 0 ? (
                topics.map(topic => (
                  <Section
                    key={topic.url}
                    style={card}
                  >
                    <Text style={cardHeading}>{topic.name}</Text>
                    <Text style={cardText}>{topic.reason ?? copy.fallbackReason}</Text>
                    <Button
                      href={topic.url}
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

FollowTopicsEmail.PreviewProps = {
  userName: 'Alex',
  topics: [
    {
      name: 'Credit Cards',
      url: 'https://voucha.ai/topics/credit-cards',
      reason: 'Your circle follows this topic often.',
    },
    {
      name: 'Travel',
      url: 'https://voucha.ai/topics/travel',
    },
  ],
  settingsUrl: 'https://voucha.ai/my/topics/following',
  unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
  physicalAddress: '123 Placeholder St, Suite 100, San Francisco, CA 94105',
}

async function renderFollowTopicsEmail(props: FollowTopicsEmailProps): EmailRenderResultPromise {
  const locale = resolveUiLocale(props.uiLocale)
  const copy = followTopicsCopyByLocale[locale]
  return {
    subject: copy.subject,
    html: await render(<FollowTopicsEmail {...props} />, { pretty: true }),
    text: [
      copy.greeting(props.userName),
      '',
      copy.bodyText,
      '',
      ...props.topics.flatMap(topic => [
        topic.name,
        topic.reason ?? copy.fallbackReason,
        `${copy.itemButton}: ${topic.url}`,
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

const RenderableFollowTopicsEmail = Object.assign(FollowTopicsEmail, {
  render: renderFollowTopicsEmail,
})
export default RenderableFollowTopicsEmail
