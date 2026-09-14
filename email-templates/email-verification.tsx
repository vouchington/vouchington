import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
  render,
} from './react-email-runtime.mts'
import { emailCopy } from './catalog-copy.mts'
import { VouchaFooter, VouchaHeader } from './components.tsx'
import { getLocalizedSignoff, resolveUiLocale } from './locale.mts'
import { styles } from './styles.mts'
import type {
  EmailRenderResultPromise,
  EmailVerificationEmailProps,
  PreviewableEmailComponent,
} from './types.mts'

const EmailVerificationEmail: PreviewableEmailComponent<EmailVerificationEmailProps> = ({
  token,
  uiLocale,
}) =>
  (() => {
    const locale = resolveUiLocale(uiLocale)
    const t = emailCopy(locale, 'email-verification')

    return (
      <Html>
        <Head />
        <Preview>{t('preview')}</Preview>
        <Body style={styles.main}>
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
  token: 'verify123',
}

async function renderEmailVerificationEmail(
  props: EmailVerificationEmailProps,
): EmailRenderResultPromise {
  const locale = resolveUiLocale(props.uiLocale)
  const t = emailCopy(locale, 'email-verification')
  return {
    subject: t('heading'),
    html: await render(<EmailVerificationEmail {...props} />, { pretty: true }),
    text: `${t('text')}\n\n${props.token}\n\n${t('ignore')}\n\n${getLocalizedSignoff(locale)}`,
  }
}

const RenderableEmailVerificationEmail = Object.assign(EmailVerificationEmail, {
  render: renderEmailVerificationEmail,
})
export default RenderableEmailVerificationEmail
