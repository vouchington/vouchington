import {
  type EmailTranslator,
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
import { VouchaFooter, VouchaHeader } from './components.tsx'
import { getLocalizedSignoff } from './locale.mts'
import { styles } from './styles.mts'
import type { LoginTokenEmailProps } from './types.mts'

const baseUrl = process.env.SITE_ORIGIN ?? 'https://voucha.ai'
const loginButtonStyle = { ...styles.button, ...styles.buttonContainer }
const loginUrlTextStyle = { ...styles.paragraph, fontSize: '13px', wordBreak: 'break-all' } as const
const loginUrlLinkStyle = { color: '#616a75', textDecoration: 'underline' } as const
const LOGIN_TOKEN_EXPIRATION_MINUTES = 15

interface LoginTokenEmailComponentProps extends LoginTokenEmailProps {
  baseUrl?: string
}

const LoginTokenEmail: PreviewableEmailComponent<LoginTokenEmailComponentProps> = ({
  emailAddress,
  token,
  expiration,
  baseUrl: url = baseUrl,
  uiLocale,
}) => {
  const locale = resolveEmailLocale(uiLocale, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE)
  const t = emailCopy(locale, 'login-token')
  const expirationLabel = getExpirationLabel(t, expiration)
  const loginUrl = `${url}/login?emailAddress=${encodeURIComponent(emailAddress)}&otp=${encodeURIComponent(token)}`

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
            <Text style={styles.paragraph}>{t('intro')}</Text>

            <Button
              href={loginUrl}
              style={loginButtonStyle}
            >
              {t('button')}
            </Button>

            <Text style={styles.paragraph}>{t('fallback')}</Text>
            <Text style={loginUrlTextStyle}>
              <Link
                href={loginUrl}
                style={loginUrlLinkStyle}
              >
                {loginUrl}
              </Link>
            </Text>

            <Text style={styles.paragraph}>{t('password')}</Text>
            <Section style={styles.codeContainer}>
              <Text style={styles.code}>{token}</Text>
            </Section>

            <Text style={styles.paragraph}>
              {t('expiration')} <strong>{expirationLabel}</strong>.
            </Text>

            <Text style={styles.paragraph}>{t('ignore')}</Text>
          </Section>

          <VouchaFooter uiLocale={locale} />
        </Container>
      </Body>
    </Html>
  )
}

LoginTokenEmail.PreviewProps = {
  emailAddress: 'tests+preview@voucha.ai',
  token: 'ABCDEFG234',
  expiration: '15 minutes',
}

function getExpirationLabel(t: EmailTranslator, expiration: string): string {
  return expiration === `${LOGIN_TOKEN_EXPIRATION_MINUTES} minutes`
    ? t('expirationLabel')
    : expiration
}

async function renderLoginTokenEmail(props: LoginTokenEmailProps): EmailRenderResultPromise {
  const locale = resolveEmailLocale(props.uiLocale, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE)
  const t = emailCopy(locale, 'login-token')
  const expirationLabel = getExpirationLabel(t, props.expiration)
  const loginUrl = `${baseUrl}/login?emailAddress=${encodeURIComponent(props.emailAddress)}&otp=${encodeURIComponent(props.token)}`

  return renderTemplateEmail({
    subject: t('subject'),
    element: <LoginTokenEmail {...props} />,
    pretty: true,
    text: `${t('textGreeting')}\n\n${t('textLinkIntro')}\n\n${loginUrl}\n\n${t('textPasswordIntro')}\n\n${props.token}\n\n${t('textTokenExpires')} ${expirationLabel}.\n${t('ignore')}\n\n${getLocalizedSignoff(locale)}`,
  })
}

const RenderableLoginTokenEmail = Object.assign(LoginTokenEmail, { render: renderLoginTokenEmail })
export default RenderableLoginTokenEmail
