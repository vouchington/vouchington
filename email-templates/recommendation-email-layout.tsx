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
} from './react-email-runtime.mts'
import { emailOptional, type EmailTranslator } from './catalog-copy.mts'
import { MarketingFooter, VouchaHeader } from './components.tsx'
import type { UiLocale } from './locale.mts'
import { borderRadius, colors, styles } from './styles.mts'

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

const unsubscribeLink = {
  color: colors.primary,
  textDecoration: 'underline',
}

// `t` is bound to the template's copy family, which must define the shared keys used below.
export type RecommendationEmailLayoutProps = {
  locale: UiLocale
  t: EmailTranslator
  userName?: string
  recommendations: { name: string; url: string; detail: string }[]
  settingsUrl: string
  unsubscribeUrl: string
  physicalAddress: string
}

export function RecommendationEmailLayout({
  locale,
  t,
  userName,
  recommendations,
  settingsUrl,
  unsubscribeUrl,
  physicalAddress,
}: RecommendationEmailLayoutProps) {
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

            {recommendations.length > 0 ? (
              recommendations.map(recommendation => (
                <Section
                  key={recommendation.url}
                  style={card}
                >
                  <Text style={cardHeading}>{recommendation.name}</Text>
                  <Text style={cardText}>{recommendation.detail}</Text>
                  <Button
                    href={recommendation.url}
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
                style={unsubscribeLink}
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
}
