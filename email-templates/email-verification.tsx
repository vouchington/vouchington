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
import { VouchaFooter, VouchaHeader } from './components.tsx'
import { getLocalizedSignoff, resolveUiLocale } from './locale.mts'
import { styles } from './styles.mts'
import type {
  EmailRenderResultPromise,
  EmailVerificationEmailProps,
  PreviewableEmailComponent,
} from './types.mts'

// oxlint-disable-next-line react/only-export-components
export const emailVerificationCopyByLocale = {
  en: {
    preview: 'Verify your email address',
    heading: 'Verify Your Email Address',
    body: 'Enter the verification code below to confirm your email address:',
    ignore: 'If you did not create this account, you can safely ignore this email.',
    text: 'Enter this verification code to confirm your email address:',
  },
  es: {
    preview: 'Verifica tu dirección de correo electrónico',
    heading: 'Verifica tu dirección de correo electrónico',
    body: 'Introduce el código de verificación de abajo para confirmar tu dirección de correo electrónico:',
    ignore: 'Si no creaste esta cuenta, puedes ignorar este correo sin problema.',
    text: 'Introduce este código de verificación para confirmar tu dirección de correo electrónico:',
  },
  fr: {
    preview: 'Vérifiez votre adresse e-mail',
    heading: 'Vérifiez votre adresse e-mail',
    body: 'Saisissez le code de vérification ci-dessous pour confirmer votre adresse e-mail :',
    ignore: "Si vous n'avez pas créé ce compte, vous pouvez ignorer cet e-mail en toute sécurité.",
    text: 'Saisissez ce code de vérification pour confirmer votre adresse e-mail :',
  },
  pt: {
    preview: 'Verifique seu endereço de email',
    heading: 'Verifique seu endereço de email',
    body: 'Digite o código de verificação abaixo para confirmar seu endereço de email:',
    ignore: 'Se você não criou esta conta, pode ignorar este email com segurança.',
    text: 'Digite este código de verificação para confirmar seu endereço de email:',
  },
} as const

const EmailVerificationEmail: PreviewableEmailComponent<EmailVerificationEmailProps> = ({
  token,
  uiLocale,
}) =>
  (() => {
    const locale = resolveUiLocale(uiLocale)
    const copy = emailVerificationCopyByLocale[locale]

    return (
      <Html>
        <Head />
        <Preview>{copy.preview}</Preview>
        <Body style={styles.main}>
          <Container style={styles.container}>
            <VouchaHeader />
            <Section style={styles.section}>
              <Text style={styles.heading}>{copy.heading}</Text>
              <Text style={styles.paragraph}>{copy.body}</Text>

              <Section style={styles.codeContainer}>
                <Text style={styles.code}>{token}</Text>
              </Section>

              <Text style={styles.paragraph}>{copy.ignore}</Text>
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
  const copy = emailVerificationCopyByLocale[locale]
  return {
    subject:
      locale === 'en'
        ? 'Verify Your Email Address'
        : locale === 'es'
          ? 'Verifica tu dirección de correo electrónico'
          : locale === 'fr'
            ? 'Vérifiez votre adresse e-mail'
            : 'Verifique seu endereço de email',
    html: await render(<EmailVerificationEmail {...props} />, { pretty: true }),
    text: `${copy.text}\n\n${props.token}\n\n${copy.ignore}\n\n${getLocalizedSignoff(locale)}`,
  }
}

const RenderableEmailVerificationEmail = Object.assign(EmailVerificationEmail, {
  render: renderEmailVerificationEmail,
})
export default RenderableEmailVerificationEmail
