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
  CommunityApplicationDecisionEmailProps,
  EmailRenderResultPromise,
  PreviewableEmailComponent,
} from './types.mts'

// oxlint-disable-next-line react/only-export-components
export const applicationDecisionCopyByLocale = {
  en: {
    approved: {
      subject: 'Your application to {communityName} was approved',
      preview: 'Your application to {communityName} was approved',
      heading: 'Application Approved',
      body: 'Your application to join {communityName} has been approved. Welcome aboard!',
      button: 'View community',
      textBody: 'Your application to join {communityName} has been approved. Welcome aboard!',
      textButton: 'View community:',
    },
    rejected: {
      subject: 'Your application to {communityName} was rejected',
      preview: 'Your application to {communityName} was rejected',
      heading: 'Application Not Approved',
      body: 'Your application to join {communityName} was not approved at this time.',
      button: 'View community',
      reasonLabel: 'Reason:',
      textBody: 'Your application to join {communityName} was not approved at this time.',
      textButton: 'View community:',
    },
  },
  es: {
    approved: {
      subject: 'Tu solicitud para unirte a {communityName} fue aprobada',
      preview: 'Tu solicitud para unirte a {communityName} fue aprobada',
      heading: 'Solicitud aprobada',
      body: 'Tu solicitud para unirte a {communityName} ha sido aprobada. ¡Bienvenido!',
      button: 'Ver comunidad',
      textBody: 'Tu solicitud para unirte a {communityName} ha sido aprobada. ¡Bienvenido!',
      textButton: 'Ver comunidad:',
    },
    rejected: {
      subject: 'Tu solicitud para unirte a {communityName} fue rechazada',
      preview: 'Tu solicitud para unirte a {communityName} fue rechazada',
      heading: 'Solicitud no aprobada',
      body: 'Tu solicitud para unirte a {communityName} no fue aprobada en esta ocasión.',
      button: 'Ver comunidad',
      reasonLabel: 'Motivo:',
      textBody: 'Tu solicitud para unirte a {communityName} no fue aprobada en esta ocasión.',
      textButton: 'Ver comunidad:',
    },
  },
  fr: {
    approved: {
      subject: 'Votre candidature pour rejoindre {communityName} a été approuvée',
      preview: 'Votre candidature pour rejoindre {communityName} a été approuvée',
      heading: 'Candidature approuvée',
      body: 'Votre candidature pour rejoindre {communityName} a été approuvée. Bienvenue !',
      button: 'Voir la communauté',
      textBody: 'Votre candidature pour rejoindre {communityName} a été approuvée. Bienvenue !',
      textButton: 'Voir la communauté :',
    },
    rejected: {
      subject: 'Votre candidature pour rejoindre {communityName} a été refusée',
      preview: 'Votre candidature pour rejoindre {communityName} a été refusée',
      heading: 'Candidature non approuvée',
      body: "Votre candidature pour rejoindre {communityName} n'a pas été approuvée cette fois-ci.",
      button: 'Voir la communauté',
      reasonLabel: 'Motif :',
      textBody:
        "Votre candidature pour rejoindre {communityName} n'a pas été approuvée cette fois-ci.",
      textButton: 'Voir la communauté :',
    },
  },
  pt: {
    approved: {
      subject: 'Sua solicitação para entrar em {communityName} foi aprovada',
      preview: 'Sua solicitação para entrar em {communityName} foi aprovada',
      heading: 'Solicitação aprovada',
      body: 'Sua solicitação para entrar em {communityName} foi aprovada. Seja bem-vindo!',
      button: 'Ver comunidade',
      textBody: 'Sua solicitação para entrar em {communityName} foi aprovada. Seja bem-vindo!',
      textButton: 'Ver comunidade:',
    },
    rejected: {
      subject: 'Sua solicitação para entrar em {communityName} foi rejeitada',
      preview: 'Sua solicitação para entrar em {communityName} foi rejeitada',
      heading: 'Solicitação não aprovada',
      body: 'Sua solicitação para entrar em {communityName} não foi aprovada desta vez.',
      button: 'Ver comunidade',
      reasonLabel: 'Motivo:',
      textBody: 'Sua solicitação para entrar em {communityName} não foi aprovada desta vez.',
      textButton: 'Ver comunidade:',
    },
  },
} as const

const CommunityApplicationDecisionEmail: PreviewableEmailComponent<
  CommunityApplicationDecisionEmailProps
> = ({ communityName, communityUrl, status, rejectionReason, uiLocale }) => {
  const locale = resolveUiLocale(uiLocale)
  const localeCopy = applicationDecisionCopyByLocale[locale]
  const copy = localeCopy[status]

  return (
    <Html>
      <Head />
      <Preview>{copy.preview.replace('{communityName}', communityName)}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <VouchaHeader />
          <Section style={styles.section}>
            <Text style={styles.heading}>{copy.heading}</Text>
            <Text style={styles.paragraph}>
              {copy.body.replace('{communityName}', communityName)}
            </Text>

            {status === 'rejected' && rejectionReason ? (
              <Text style={styles.paragraph}>
                <strong>{localeCopy.rejected.reasonLabel}</strong> {rejectionReason}
              </Text>
            ) : null}

            <Section style={styles.buttonContainer}>
              <Button
                href={communityUrl}
                style={styles.button}
              >
                {copy.button}
              </Button>
            </Section>
          </Section>

          <VouchaFooter uiLocale={locale} />
        </Container>
      </Body>
    </Html>
  )
}

CommunityApplicationDecisionEmail.PreviewProps = {
  communityName: 'Travel Hackers',
  communityUrl: 'https://voucha.ai/communities/travel-hackers',
  status: 'approved',
}

async function renderCommunityApplicationDecisionEmail(
  props: CommunityApplicationDecisionEmailProps,
): EmailRenderResultPromise {
  const locale = resolveUiLocale(props.uiLocale)
  const localeCopy = applicationDecisionCopyByLocale[locale]
  const copy = localeCopy[props.status]

  const reasonLine =
    props.status === 'rejected' && props.rejectionReason
      ? `\n\n${localeCopy.rejected.reasonLabel} ${props.rejectionReason}`
      : ''

  return {
    subject: copy.subject.replace('{communityName}', props.communityName),
    html: await render(<CommunityApplicationDecisionEmail {...props} />, { pretty: true }),
    text: `${copy.textBody.replace('{communityName}', props.communityName)}${reasonLine}\n\n${copy.textButton} ${props.communityUrl}\n\n${getLocalizedSignoff(locale)}`,
  }
}

const RenderableCommunityApplicationDecisionEmail = Object.assign(
  CommunityApplicationDecisionEmail,
  { render: renderCommunityApplicationDecisionEmail },
)
export default RenderableCommunityApplicationDecisionEmail
