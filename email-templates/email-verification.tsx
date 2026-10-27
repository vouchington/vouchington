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
import type { EmailVerificationEmailProps } from './types.mts'

const EmailVerificationEmail: PreviewableEmailComponent<EmailVerificationEmailProps> = ({
  token,
  uiLocale,
}) =>
  (() => {
    const locale = resolveEmailLocale(uiLocale, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE)
    const t = emailCopy(locale, 'email-verification')

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

              <Text style={styles.paragraph}>{t('ignore')}</Text>
            </Section>

            <VouchaFooter uiLocale={locale} />
          </Container>
        </Body>
      </Html>
    )
  })()

EmailVerificationEmail.PreviewProps = {
  token: 'ABCDEFG234',
}

async function renderEmailVerificationEmail(
  props: EmailVerificationEmailProps,
): EmailRenderResultPromise {
  const locale = resolveEmailLocale(props.uiLocale, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE)
  const t = emailCopy(locale, 'email-verification')
  return renderTemplateEmail({
    subject: t('heading'),
    element: <EmailVerificationEmail {...props} />,
    pretty: true,
    text: `${t('text')}\n\n${props.token}\n\n${t('ignore')}\n\n${getLocalizedSignoff(locale)}`,
  })
}

const RenderableEmailVerificationEmail = Object.assign(EmailVerificationEmail, {
  render: renderEmailVerificationEmail,
})
export default RenderableEmailVerificationEmail
