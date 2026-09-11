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
import { styles } from './styles.mts'
import type {
  DataExportReadyEmailProps,
  EmailRenderResultPromise,
  PreviewableEmailComponent,
} from './types.mts'

interface DataExportReadyComponentProps extends DataExportReadyEmailProps {}

// oxlint-disable-next-line react/only-export-components
export const dataExportReadyCopyByLocale = {
  en: {
    preview: 'Your data export is ready',
    heading: 'Your Data Export is Ready',
    body: 'Your data export from Voucha is ready to download.',
    button: 'Download Your Data',
    expiry: 'The download link will expire in',
    support: 'If you did not request this export, please contact our support team.',
    textBody: 'Your data export from Voucha is ready to download.',
    textLink: 'Download link:',
    textExpiry: 'The download link will expire in',
    day: 'day',
    days: 'days',
  },
  es: {
    preview: 'Tu exportación de datos está lista',
    heading: 'Tu exportación de datos está lista',
    body: 'Tu exportación de datos de Voucha está lista para descargar.',
    button: 'Descargar tus datos',
    expiry: 'El enlace de descarga expirará en',
    support: 'Si no solicitaste esta exportación, ponte en contacto con nuestro equipo de soporte.',
    textBody: 'Tu exportación de datos de Voucha está lista para descargar.',
    textLink: 'Enlace de descarga:',
    textExpiry: 'El enlace de descarga expirará en',
    day: 'día',
    days: 'días',
  },
  fr: {
    preview: 'Votre export de données est prêt',
    heading: 'Votre export de données est prêt',
    body: 'Votre export de données Voucha est prêt à être téléchargé.',
    button: 'Télécharger vos données',
    expiry: 'Le lien de téléchargement expirera dans',
    support: "Si vous n'avez pas demandé cet export, veuillez contacter notre équipe d'assistance.",
    textBody: 'Votre export de données Voucha est prêt à être téléchargé.',
    textLink: 'Lien de téléchargement :',
    textExpiry: 'Le lien de téléchargement expirera dans',
    day: 'jour',
    days: 'jours',
  },
  pt: {
    preview: 'Sua exportação de dados está pronta',
    heading: 'Sua exportação de dados está pronta',
    body: 'Sua exportação de dados da Voucha está pronta para baixar.',
    button: 'Baixar seus dados',
    expiry: 'O link de download expirará em',
    support: 'Se você não solicitou esta exportação, entre em contato com nossa equipe de suporte.',
    textBody: 'Sua exportação de dados da Voucha está pronta para baixar.',
    textLink: 'Link de download:',
    textExpiry: 'O link de download expirará em',
    day: 'dia',
    days: 'dias',
  },
} as const

function getExpiryUnit(
  expiresInDays: number,
  copy: (typeof dataExportReadyCopyByLocale)[keyof typeof dataExportReadyCopyByLocale],
) {
  return expiresInDays === 1 ? copy.day : copy.days
}

const DataExportReadyEmail: PreviewableEmailComponent<DataExportReadyComponentProps> = ({
  downloadUrl,
  expiresInDays,
  uiLocale,
}) =>
  (() => {
    const locale = resolveUiLocale(uiLocale)
    const copy = dataExportReadyCopyByLocale[locale]

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

              <Section style={styles.buttonContainer}>
                <Button
                  href={downloadUrl}
                  style={styles.button}
                >
                  {copy.button}
                </Button>
              </Section>

              <Text style={styles.paragraph}>
                {copy.expiry} <strong>{expiresInDays}</strong> {getExpiryUnit(expiresInDays, copy)}.{' '}
                {locale === 'en'
                  ? 'Please download your data within this timeframe.'
                  : locale === 'es'
                    ? 'Descarga tus datos dentro de este plazo.'
                    : locale === 'fr'
                      ? 'Veuillez télécharger vos données avant la fin de ce délai.'
                      : 'Baixe seus dados dentro desse prazo.'}
              </Text>

              <Text style={styles.paragraph}>{copy.support}</Text>
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
  const locale = resolveUiLocale(props.uiLocale)
  const copy = dataExportReadyCopyByLocale[locale]
  return {
    subject:
      locale === 'en'
        ? 'Your Data Export is Ready'
        : locale === 'es'
          ? 'Tu exportación de datos está lista'
          : locale === 'fr'
            ? 'Votre export de données est prêt'
            : 'Sua exportação de dados está pronta',
    html: await render(<DataExportReadyEmail {...props} />, { pretty: true }),
    text: `${copy.textBody}\n\n${copy.textLink} ${props.downloadUrl}\n\n${copy.textExpiry} ${props.expiresInDays} ${getExpiryUnit(props.expiresInDays, copy)}. ${
      locale === 'en'
        ? 'Please download your data within this timeframe.'
        : locale === 'es'
          ? 'Descarga tus datos dentro de este plazo.'
          : locale === 'fr'
            ? 'Veuillez télécharger vos données avant la fin de ce délai.'
            : 'Baixe seus dados dentro desse prazo.'
    }\n\n${copy.support}\n\n${getLocalizedSignoff(locale)}`,
  }
}

const RenderableDataExportReadyEmail = Object.assign(DataExportReadyEmail, {
  render: renderDataExportReadyEmail,
})
export default RenderableDataExportReadyEmail
