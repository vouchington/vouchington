import {
  type EmailRenderResultPromise,
  type PreviewableEmailComponent,
  resolveEmailLocale,
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
  renderEmail as renderTemplateEmail,
} from '@vouchington/email'

import { SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE } from '@ts-shared/languages/ui-locales'

import { emailCopy } from './catalog-copy.mts'
import { VouchaFooter, VouchaHeader } from './components.tsx'
import { getLocalizedSignoff } from './locale.mts'
import { styles } from './styles.mts'
import type { ReauthenticationEmailProps } from './types.mts'

const ReauthenticationEmail: PreviewableEmailComponent<ReauthenticationEmailProps> = ({
  token,
  expiresInMinutes,
  uiLocale,
}) =>
  (() => {
    const locale = resolveEmailLocale(uiLocale, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE)
    const t = emailCopy(locale, 'reauthentication')

    return (
      <Html lang={locale}>
        <Head />
        <Preview>{t('preview')}</Preview>
        <Body
          lang={locale}
          style={styles.main}
        >
          <Container style={styles.container}>
            <VouchaHeader />
            <Section style={styles.section}>
              <Text style={styles.heading}>{t('heading')}</Text>
              <Text style={styles.paragraph}>{t('body')}</Text>

              <Section style={styles.codeContainer}>
                <Text style={styles.code}>{token}</Text>
              </Section>

              <Text style={styles.paragraph}>{t('expiry', { minutes: expiresInMinutes })}</Text>
              <Text style={styles.paragraph}>{t('secure')}</Text>
            </Section>

            <VouchaFooter uiLocale={locale} />
          </Container>
        </Body>
      </Html>
    )
  })()

ReauthenticationEmail.PreviewProps = {
  token: 'ABCDEFG234',
  expiresInMinutes: 15,
}

async function renderReauthenticationEmail(
  props: ReauthenticationEmailProps,
): EmailRenderResultPromise {
  const locale = resolveEmailLocale(props.uiLocale, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE)
  const t = emailCopy(locale, 'reauthentication')
  return renderTemplateEmail({
    subject: t('heading'),
    element: <ReauthenticationEmail {...props} />,
    pretty: true,
    text: `${t('text')}\n\n${props.token}\n\n${t('expiry', { minutes: props.expiresInMinutes })}\n\n${t('secure')}\n\n${getLocalizedSignoff(locale)}`,
  })
}

const RenderableReauthenticationEmail = Object.assign(ReauthenticationEmail, {
  render: renderReauthenticationEmail,
})
export default RenderableReauthenticationEmail
