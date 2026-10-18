import {
  type EmailRenderResultPromise,
  resolveEmailLocale,
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
  renderEmail as renderTemplateEmail,
} from '@vouchington/email'

import { SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE } from '@ts-shared/languages/ui-locales'

import { VouchaFooter, VouchaHeader } from './components.tsx'
import { styles } from './styles.mts'
import type { ApiKeyExpiryEmailProps } from './types.mts'
import { emailCopy } from './catalog-copy.mts'

function ApiKeyExpiryEmail(props: ApiKeyExpiryEmailProps) {
  const locale = resolveEmailLocale(props.uiLocale, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE)
  const t = emailCopy(locale, 'api-key-expiry')
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{t('subject')}</Preview>
      <Body
        lang={locale}
        style={styles.main}
      >
        <Container style={styles.container}>
          <VouchaHeader />
          <Section style={styles.section}>
            <Text style={styles.heading}>{t('subject')}</Text>
            <Text style={styles.paragraph}>
              {t('body', { label: props.label, date: props.expiresAt })}
            </Text>
            <Text style={styles.paragraph}>{t('action')}</Text>
            <Button
              href={props.apiKeysUrl}
              style={styles.button}
            >
              {t('button')}
            </Button>
          </Section>
          <VouchaFooter uiLocale={props.uiLocale} />
        </Container>
      </Body>
    </Html>
  )
}

async function renderApiKeyExpiryEmail(props: ApiKeyExpiryEmailProps): EmailRenderResultPromise {
  const t = emailCopy(
    resolveEmailLocale(props.uiLocale, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE),
    'api-key-expiry',
  )
  return renderTemplateEmail({
    subject: t('subject'),
    element: <ApiKeyExpiryEmail {...props} />,
    pretty: true,
    text: [
      t('body', { label: props.label, date: props.expiresAt }),
      t('action'),
      `${t('button')}: ${props.apiKeysUrl}`,
    ].join('\n\n'),
  })
}

const RenderableApiKeyExpiryEmail = Object.assign(ApiKeyExpiryEmail, {
  render: renderApiKeyExpiryEmail,
})
export default RenderableApiKeyExpiryEmail
