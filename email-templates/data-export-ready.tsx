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
import type { DataExportReadyEmailProps } from './types.mts'

interface DataExportReadyComponentProps extends DataExportReadyEmailProps {}

function getExpiryUnit(expiresInDays: number, t: EmailTranslator) {
  return expiresInDays === 1 ? t('day') : t('days')
}

const DataExportReadyEmail: PreviewableEmailComponent<DataExportReadyComponentProps> = ({
  downloadUrl,
  expiresInDays,
  uiLocale,
}) =>
  (() => {
    const locale = resolveEmailLocale(uiLocale, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE)
    const t = emailCopy(locale, 'data-export-ready')

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

              <Section style={styles.buttonContainer}>
                <Button
                  href={downloadUrl}
                  style={styles.button}
                >
                  {t('button')}
                </Button>
              </Section>

              <Text style={styles.paragraph}>
                {t('expiry')} <strong>{expiresInDays}</strong> {getExpiryUnit(expiresInDays, t)}.{' '}
                {t('timeframe')}
              </Text>

              <Text style={styles.paragraph}>{t('support')}</Text>
            </Section>

            <VouchaFooter uiLocale={locale} />
          </Container>
        </Body>
      </Html>
    )
  })()

DataExportReadyEmail.PreviewProps = {
  downloadUrl: 'https://voucha.ai/downloads/preview',
  expiresInDays: 7,
}

async function renderDataExportReadyEmail(
  props: DataExportReadyEmailProps,
): EmailRenderResultPromise {
  const locale = resolveEmailLocale(props.uiLocale, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE)
  const t = emailCopy(locale, 'data-export-ready')
  return renderTemplateEmail({
    subject: t('heading'),
    element: <DataExportReadyEmail {...props} />,
    pretty: true,
    text: `${t('textBody')}\n\n${t('textLink')} ${props.downloadUrl}\n\n${t('textExpiry')} ${props.expiresInDays} ${getExpiryUnit(props.expiresInDays, t)}. ${t('timeframe')}\n\n${t('support')}\n\n${getLocalizedSignoff(locale)}`,
  })
}

const RenderableDataExportReadyEmail = Object.assign(DataExportReadyEmail, {
  render: renderDataExportReadyEmail,
})
export default RenderableDataExportReadyEmail
