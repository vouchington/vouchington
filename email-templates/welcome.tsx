import {
  emailOptional,
  type EmailRenderResultPromise,
  type PreviewableEmailComponent,
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
import { emailCopy } from './catalog-copy.mts'
import { getLocalizedSignoff } from './locale.mts'
import { styles } from './styles.mts'
import type { WelcomeEmailProps } from './types.mts'

const baseUrl = process.env.SITE_ORIGIN ?? 'https://voucha.ai'

const WelcomeEmail: PreviewableEmailComponent<WelcomeEmailProps> = ({ userName, uiLocale }) => {
  const locale = resolveEmailLocale(uiLocale, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE)
  const t = emailCopy(locale, 'welcome')

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
            <Text style={styles.heading}>{emailOptional(t, 'heading', userName)}</Text>
            <Text style={styles.paragraph}>{t('intro')}</Text>

            <Text style={styles.listItem}>
              <strong>{t('bullet1Title')}</strong> — {t('bullet1Text')}
            </Text>
            <Text style={styles.listItem}>
              <strong>{t('bullet2Title')}</strong> — {t('bullet2Text')}
            </Text>
            <Text style={styles.listItem}>
              <strong>{t('bullet3Title')}</strong> — {t('bullet3Text')}
            </Text>

            <Section style={styles.buttonContainer}>
              <Button
                href={`${baseUrl}/sources`}
                style={styles.button}
              >
                {t('button')}
              </Button>
            </Section>

            <Text style={styles.paragraph}>{t('outro')}</Text>
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
  const locale = resolveEmailLocale(props.uiLocale, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE)
  const t = emailCopy(locale, 'welcome')
  return renderTemplateEmail({
    subject: t('preview'),
    element: <WelcomeEmail {...props} />,
    pretty: true,
    text: `${emailOptional(t, 'heading', props.userName)}\n\n${t('textIntro')}\n\n- ${t('textBullet1')}\n- ${t('textBullet2')}\n- ${t('textBullet3')}\n\n${t('textBrowse')} ${baseUrl}/sources\n\n${t('textOutro')}\n\n${getLocalizedSignoff(locale)}`,
  })
}

const RenderableWelcomeEmail = Object.assign(WelcomeEmail, { render: renderWelcomeEmail })
export default RenderableWelcomeEmail
