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
import { getLocalizedSignoff, resolveUiLocale } from './locale.mts'
import { copyByLocale } from './welcome-copy.mts'
import { styles } from './styles.mts'
import type {
  EmailRenderResultPromise,
  PreviewableEmailComponent,
  WelcomeEmailProps,
} from './types.mts'

const baseUrl = process.env.SITE_ORIGIN ?? 'https://voucha.ai'

const WelcomeEmail: PreviewableEmailComponent<WelcomeEmailProps> = ({ userName, uiLocale }) => {
  const locale = resolveUiLocale(uiLocale)
  const copy = copyByLocale[locale]

  return (
    <Html>
      <Head />
      <Preview>{copy.preview}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <VouchaHeader />
          <Section style={styles.section}>
            <Text style={styles.heading}>{copy.heading(userName)}</Text>
            <Text style={styles.paragraph}>{copy.intro}</Text>

            <Text style={styles.listItem}>
              <strong>{copy.bullet1Title}</strong> — {copy.bullet1Text}
            </Text>
            <Text style={styles.listItem}>
              <strong>{copy.bullet2Title}</strong> — {copy.bullet2Text}
            </Text>
            <Text style={styles.listItem}>
              <strong>{copy.bullet3Title}</strong> — {copy.bullet3Text}
            </Text>

            <Section style={styles.buttonContainer}>
              <Button
                href={`${baseUrl}/sources`}
                style={styles.button}
              >
                {copy.button}
              </Button>
            </Section>

            <Text style={styles.paragraph}>{copy.outro}</Text>
          </Section>

          <VouchaFooter uiLocale={locale} />
        </Container>
      </Body>
    </Html>
  )
}

WelcomeEmail.PreviewProps = {
  userName: 'Alex',
}

async function renderWelcomeEmail(props: WelcomeEmailProps): EmailRenderResultPromise {
  const locale = resolveUiLocale(props.uiLocale)
  const copy = copyByLocale[locale]
  return {
    subject:
      locale === 'en'
        ? 'Welcome to Voucha — here’s what you can do'
        : locale === 'es'
          ? 'Bienvenido a Voucha — esto es lo que puedes hacer'
          : locale === 'fr'
            ? 'Bienvenue sur Voucha — voici ce que vous pouvez faire'
            : 'Bem-vindo à Voucha — veja o que você pode fazer',
    html: await render(<WelcomeEmail {...props} />, { pretty: true }),
    text: `${copy.heading(props.userName)}\n\n${copy.textIntro}\n\n- ${copy.textBullet1}\n- ${copy.textBullet2}\n- ${copy.textBullet3}\n\n${copy.textBrowse} ${baseUrl}/sources\n\n${copy.textOutro}\n\n${getLocalizedSignoff(locale)}`,
  }
}

const RenderableWelcomeEmail = Object.assign(WelcomeEmail, { render: renderWelcomeEmail })
export default RenderableWelcomeEmail
