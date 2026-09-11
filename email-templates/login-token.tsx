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

// oxlint-disable-next-line react/only-export-components
export const loginTokenCopyByLocale = {
  en: {
    preview: 'Your Voucha one-time password',
    heading: 'Sign in to Voucha',
    intro: 'Click the link below to log in to your account:',
    button: 'Log In',
    fallback: 'If the button does not work, use this URL:',
    password: 'Or use this one-time password:',
    expiration: 'This token will expire in',
    expirationLabel: `${LOGIN_TOKEN_EXPIRATION_MINUTES} minutes`,
    ignore: 'If you did not request this, please ignore this email.',
    textGreeting: 'Hi,',
    textLinkIntro: 'You can log in to Voucha by clicking this link:',
    textPasswordIntro: 'Or you can log in with your email address and one-time password:',
    textTokenExpires: 'This token will expire in',
  },
  es: {
    preview: 'Tu contraseña de un solo uso de Voucha',
    heading: 'Inicia sesión en Voucha',
    intro: 'Haz clic en el enlace de abajo para iniciar sesión en tu cuenta:',
    button: 'Iniciar sesión',
    fallback: 'Si el botón no funciona, usa esta URL:',
    password: 'O usa esta contraseña de un solo uso:',
    expiration: 'Este código expirará en',
    expirationLabel: `${LOGIN_TOKEN_EXPIRATION_MINUTES} minutos`,
    ignore: 'Si no solicitaste esto, puedes ignorar este correo.',
    textGreeting: 'Hola,',
    textLinkIntro: 'Puedes iniciar sesión en Voucha haciendo clic en este enlace:',
    textPasswordIntro:
      'O puedes iniciar sesión con tu correo electrónico y contraseña de un solo uso:',
    textTokenExpires: 'Este código expirará en',
  },
  fr: {
    preview: 'Votre mot de passe à usage unique Voucha',
    heading: 'Connectez-vous à Voucha',
    intro: 'Cliquez sur le lien ci-dessous pour vous connecter à votre compte :',
    button: 'Se connecter',
    fallback: 'Si le bouton ne fonctionne pas, utilisez cette URL :',
    password: 'Ou utilisez ce mot de passe à usage unique :',
    expiration: 'Ce code expirera dans',
    expirationLabel: `${LOGIN_TOKEN_EXPIRATION_MINUTES} minutes`,
    ignore: "Si vous n'avez pas demandé cela, ignorez simplement cet e-mail.",
    textGreeting: 'Bonjour,',
    textLinkIntro: 'Vous pouvez vous connecter à Voucha en cliquant sur ce lien :',
    textPasswordIntro:
      'Ou vous pouvez vous connecter avec votre adresse e-mail et votre mot de passe à usage unique :',
    textTokenExpires: 'Ce code expirera dans',
  },
  pt: {
    preview: 'Sua senha de uso único da Voucha',
    heading: 'Entre na Voucha',
    intro: 'Clique no link abaixo para entrar na sua conta:',
    button: 'Entrar',
    fallback: 'Se o botão não funcionar, use esta URL:',
    password: 'Ou use esta senha de uso único:',
    expiration: 'Este código expirará em',
    expirationLabel: `${LOGIN_TOKEN_EXPIRATION_MINUTES} minutos`,
    ignore: 'Se você não solicitou isso, ignore este email.',
    textGreeting: 'Olá,',
    textLinkIntro: 'Você pode entrar na Voucha clicando neste link:',
    textPasswordIntro: 'Ou você pode entrar com seu endereço de email e senha de uso único:',
    textTokenExpires: 'Este código expirará em',
  },
} as const

const LoginTokenEmail: PreviewableEmailComponent<LoginTokenEmailComponentProps> = ({
  emailAddress,
  token,
  expiration,
  baseUrl: url = baseUrl,
  uiLocale,
}) => {
  const locale = resolveUiLocale(uiLocale)
  const copy = loginTokenCopyByLocale[locale]
  const expirationLabel = getExpirationLabel(locale, expiration)
  const loginUrl = `${url}/login?emailAddress=${encodeURIComponent(emailAddress)}&otp=${encodeURIComponent(token)}`

  return (
    <Html>
      <Head />
      <Preview>{copy.preview}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <VouchaHeader />
          <Section style={styles.section}>
            <Text style={styles.heading}>{copy.heading}</Text>
            <Text style={styles.paragraph}>{copy.intro}</Text>

            <Button
              href={loginUrl}
              style={loginButtonStyle}
            >
              {copy.button}
            </Button>

            <Text style={styles.paragraph}>{copy.fallback}</Text>
            <Text style={loginUrlTextStyle}>
              <Link
                href={loginUrl}
                style={loginUrlLinkStyle}
              >
                {loginUrl}
              </Link>
            </Text>

            <Text style={styles.paragraph}>{copy.password}</Text>
            <Section style={styles.codeContainer}>
              <Text style={styles.code}>{token}</Text>
            </Section>

            <Text style={styles.paragraph}>
              {copy.expiration} <strong>{expirationLabel}</strong>.
            </Text>

            <Text style={styles.paragraph}>{copy.ignore}</Text>
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

function getExpirationLabel(
  locale: keyof typeof loginTokenCopyByLocale,
  expiration: string,
): string {
  return expiration === `${LOGIN_TOKEN_EXPIRATION_MINUTES} minutes`
    ? loginTokenCopyByLocale[locale].expirationLabel
    : expiration
}

async function renderLoginTokenEmail(props: LoginTokenEmailProps): EmailRenderResultPromise {
  const locale = resolveUiLocale(props.uiLocale)
  const copy = loginTokenCopyByLocale[locale]
  const expirationLabel = getExpirationLabel(locale, props.expiration)
  const loginUrl = `${baseUrl}/login?emailAddress=${encodeURIComponent(props.emailAddress)}&otp=${encodeURIComponent(props.token)}`

  return {
    subject:
      locale === 'en'
        ? 'Your Voucha One-Time Password Login'
        : locale === 'es'
          ? 'Tu inicio de sesión con contraseña de un solo uso de Voucha'
          : locale === 'fr'
            ? 'Votre connexion Voucha par mot de passe à usage unique'
            : 'Seu login da Voucha com senha de uso único',
    html: await render(<LoginTokenEmail {...props} />, { pretty: true }),
    text: `${copy.textGreeting}\n\n${copy.textLinkIntro}\n\n${loginUrl}\n\n${copy.textPasswordIntro}\n\n${props.token}\n\n${copy.textTokenExpires} ${expirationLabel}.\n${copy.ignore}\n\n${getLocalizedSignoff(locale)}`,
  }
}

const RenderableLoginTokenEmail = Object.assign(LoginTokenEmail, { render: renderLoginTokenEmail })
export default RenderableLoginTokenEmail
