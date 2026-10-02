import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
  render,
} from './react-email-runtime.mts'
import { VouchaFooter, VouchaHeader } from './components.tsx'
import { styles } from './styles.mts'
import type { ApiKeyExpiryEmailProps, EmailRenderResultPromise } from './types.mts'
import { emailCopy } from './catalog-copy.mts'
import { resolveUiLocale } from './locale.mts'

function ApiKeyExpiryEmail(props: ApiKeyExpiryEmailProps) {
  const t = emailCopy(resolveUiLocale(props.uiLocale), 'api-key-expiry')
  return (
    <Html>
      <Head />
      <Preview>{t('subject')}</Preview>
      <Body style={styles.main}>
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
  const t = emailCopy(resolveUiLocale(props.uiLocale), 'api-key-expiry')
  return {
    subject: t('subject'),
    html: await render(<ApiKeyExpiryEmail {...props} />, { pretty: true }),
    text: [
      t('body', { label: props.label, date: props.expiresAt }),
      t('action'),
      `${t('button')}: ${props.apiKeysUrl}`,
    ].join('\n\n'),
  }
}

const RenderableApiKeyExpiryEmail = Object.assign(ApiKeyExpiryEmail, {
  render: renderApiKeyExpiryEmail,
})
export default RenderableApiKeyExpiryEmail
