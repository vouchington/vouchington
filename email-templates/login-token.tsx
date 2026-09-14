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
import { emailCopy, type EmailTranslator } from './catalog-copy.mts'
import { VouchaFooter, VouchaHeader } from './components.tsx'
import { getLocalizedSignoff, resolveUiLocale } from './locale.mts'
import { styles } from './styles.mts'
import type {
  EmailRenderResultPromise,
  LoginTokenEmailProps,
  PreviewableEmailComponent,
} from './types.mts'

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
  const locale = resolveUiLocale(uiLocale)
  const t = emailCopy(locale, 'login-token')
  const expirationLabel = getExpirationLabel(t, expiration)
  const loginUrl = `${url}/login?emailAddress=${encodeURIComponent(emailAddress)}&otp=${encodeURIComponent(token)}`

  return (
    <Html>
      <Head />
      <Preview>{t('preview')}</Preview>
      <Body style={styles.main}>
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
  token: 'ABC12345',
  expiration: '15 minutes',
}

function getExpirationLabel(t: EmailTranslator, expiration: string): string {
  return expiration === `${LOGIN_TOKEN_EXPIRATION_MINUTES} minutes`
    ? t('expirationLabel')
    : expiration
}

async function renderLoginTokenEmail(props: LoginTokenEmailProps): EmailRenderResultPromise {
  const locale = resolveUiLocale(props.uiLocale)
  const t = emailCopy(locale, 'login-token')
  const expirationLabel = getExpirationLabel(t, props.expiration)
  const loginUrl = `${baseUrl}/login?emailAddress=${encodeURIComponent(props.emailAddress)}&otp=${encodeURIComponent(props.token)}`

  return {
    subject: t('subject'),
    html: await render(<LoginTokenEmail {...props} />, { pretty: true }),
    text: `${t('textGreeting')}\n\n${t('textLinkIntro')}\n\n${loginUrl}\n\n${t('textPasswordIntro')}\n\n${props.token}\n\n${t('textTokenExpires')} ${expirationLabel}.\n${t('ignore')}\n\n${getLocalizedSignoff(locale)}`,
  }
}

const RenderableLoginTokenEmail = Object.assign(LoginTokenEmail, { render: renderLoginTokenEmail })
export default RenderableLoginTokenEmail
