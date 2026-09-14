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
import { MarketingFooter, VouchaHeader } from './components.tsx'
import { getLocalizedSignoff, resolveUiLocale } from './locale.mts'
import { borderRadius, colors, styles } from './styles.mts'
import type {
  EmailRenderResultPromise,
  FollowNewsSourcesEmailProps,
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

const FollowNewsSourcesEmail: PreviewableEmailComponent<FollowNewsSourcesEmailProps> = ({
  userName,
  sources,
  settingsUrl,
  unsubscribeUrl,
  physicalAddress,
  uiLocale,
}) =>
  (() => {
    const locale = resolveUiLocale(uiLocale)
    const t = emailCopy(locale, 'follow-news-sources')
    return (
      <Html>
        <Head />
        <Preview>{t('preview')}</Preview>
        <Body style={styles.main}>
          <Container style={styles.container}>
            <VouchaHeader />
            <Section style={styles.section}>
              <Text style={styles.heading}>{t('heading')}</Text>
              <Text style={styles.paragraph}>
                {`${emailOptional(t, 'greeting', userName)} ${t('body')}`}
              </Text>

              {sources.length > 0 ? (
                sources.map(source => (
                  <Section
                    key={source.url}
                    style={card}
                  >
                    <Text style={cardHeading}>{source.name}</Text>
                    <Text style={cardText}>{source.description ?? t('fallbackDescription')}</Text>
                    <Button
                      href={source.url}
                      style={itemButton}
                    >
                      {t('itemButton')}
                    </Button>
                  </Section>
                ))
              ) : (
                <Text style={styles.paragraph}>{t('empty')}</Text>
              )}

              <Section style={styles.buttonContainer}>
                <Button
                  href={settingsUrl}
                  style={styles.button}
                >
                  {t('manage')}
                </Button>
              </Section>

              <Text style={styles.paragraph}>
                <Link
                  href={unsubscribeUrl}
                  style={linkStyle}
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

FollowNewsSourcesEmail.PreviewProps = {
  userName: 'Alex',
  sources: [
    {
      name: 'The Verge',
      url: 'https://voucha.ai/sources/the-verge',
      description: 'Tech news your circle watches.',
    },
    {
      name: 'NPR',
      url: 'https://voucha.ai/sources/npr',
    },
  ],
  settingsUrl: 'https://voucha.ai/my/notification-settings',
  unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
  physicalAddress: '123 Placeholder St, Suite 100, San Francisco, CA 94105',
}

async function renderFollowNewsSourcesEmail(
  props: FollowNewsSourcesEmailProps,
): EmailRenderResultPromise {
  const locale = resolveUiLocale(props.uiLocale)
  const t = emailCopy(locale, 'follow-news-sources')
  return {
    subject: t('subject'),
    html: await render(<FollowNewsSourcesEmail {...props} />, { pretty: true }),
    text: [
      emailOptional(t, 'greeting', props.userName),
      '',
      t('bodyText'),
      '',
      ...props.sources.flatMap(source => [
        source.name,
        source.description ?? t('fallbackDescription'),
        `${t('itemButton')}: ${source.url}`,
        '',
      ]),
      `${t('manage')}: ${props.settingsUrl}`,
      '',
      `${t('unsubscribe')}: ${props.unsubscribeUrl}`,
      '',
      getLocalizedSignoff(locale),
      '',
      props.physicalAddress,
    ].join('\n'),
  }
}

const RenderableFollowNewsSourcesEmail = Object.assign(FollowNewsSourcesEmail, {
  render: renderFollowNewsSourcesEmail,
})
export default RenderableFollowNewsSourcesEmail
