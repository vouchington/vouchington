import {
  Body,
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
import { borderRadius, colors, styles } from './styles.mts'
import type {
  CommunityInviteEmailProps,
  EmailRenderResultPromise,
  PreviewableEmailComponent,
} from './types.mts'

const baseUrl = process.env.SITE_ORIGIN ?? 'https://voucha.ai'

const linkButton = {
  backgroundColor: colors.primary,
  borderRadius,
  color: colors.primaryFg,
  fontSize: '14px',
  fontWeight: 'bold',
  textDecoration: 'none',
  padding: '10px 20px',
  display: 'inline-block' as const,
}

const codeText = {
  fontFamily: 'monospace',
  letterSpacing: '2px',
}

// oxlint-disable-next-line react/only-export-components
export const communityInviteCopyByLocale = {
  en: {
    preview: "You've been invited to join {communityName}",
    heading: 'Community Invitation',
    bodyVerb: 'has invited you to join',
    bodyTail: 'on Voucha.',
    button: 'Accept Invitation',
    inviteCode: 'Or use this invite code:',
    ignore: 'If you did not expect this invitation, you can safely ignore this email.',
    textBody: '{inviterName} has invited you to join {communityName} on Voucha.',
    textButton: 'Accept the invitation:',
    textInviteCode: 'Or use this invite code:',
    subject: "You've been invited to join {communityName}",
  },
  es: {
    preview: 'Te han invitado a unirte a {communityName}',
    heading: 'Invitación a la comunidad',
    bodyVerb: 'te ha invitado a unirte a',
    bodyTail: 'en Voucha.',
    button: 'Aceptar invitación',
    inviteCode: 'O usa este código de invitación:',
    ignore: 'Si no esperabas esta invitación, puedes ignorar este correo sin problema.',
    textBody: '{inviterName} te ha invitado a unirte a {communityName} en Voucha.',
    textButton: 'Acepta la invitación:',
    textInviteCode: 'O usa este código de invitación:',
    subject: 'Te han invitado a unirte a {communityName}',
  },
  fr: {
    preview: 'Vous avez été invité à rejoindre {communityName}',
    heading: 'Invitation à la communauté',
    bodyVerb: 'vous a invité à rejoindre',
    bodyTail: 'sur Voucha.',
    button: 'Accepter l’invitation',
    inviteCode: "Ou utilisez ce code d'invitation :",
    ignore:
      "Si vous n'attendiez pas cette invitation, vous pouvez ignorer cet e-mail en toute sécurité.",
    textBody: '{inviterName} vous a invité à rejoindre {communityName} sur Voucha.',
    textButton: "Accepter l'invitation :",
    textInviteCode: "Ou utilisez ce code d'invitation :",
    subject: 'Vous avez été invité à rejoindre {communityName}',
  },
  pt: {
    preview: 'Você foi convidado para entrar em {communityName}',
    heading: 'Convite para a comunidade',
    bodyVerb: 'convidou você para entrar em',
    bodyTail: 'na Voucha.',
    button: 'Aceitar convite',
    inviteCode: 'Ou use este código de convite:',
    ignore: 'Se você não esperava este convite, pode ignorar este email com segurança.',
    textBody: '{inviterName} convidou você para entrar em {communityName} na Voucha.',
    textButton: 'Aceitar o convite:',
    textInviteCode: 'Ou use este código de convite:',
    subject: 'Você foi convidado para entrar em {communityName}',
  },
} as const

const CommunityInviteEmail: PreviewableEmailComponent<CommunityInviteEmailProps> = ({
  communityName,
  inviterName,
  code,
  uiLocale,
}) =>
  (() => {
    const locale = resolveUiLocale(uiLocale)
    const copy = communityInviteCopyByLocale[locale]

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
                <strong>{inviterName}</strong> {copy.bodyVerb} <strong>{communityName}</strong>{' '}
                {copy.bodyTail}
              </Text>

              <Section style={styles.buttonContainer}>
                <Link
                  href={`${baseUrl}/communities/invite/${encodeURIComponent(code)}`}
                  style={linkButton}
                >
                  {copy.button}
                </Link>
              </Section>

              <Text style={styles.paragraph}>
                {copy.inviteCode} <strong style={codeText}>{code}</strong>
              </Text>

              <Text style={styles.paragraph}>{copy.ignore}</Text>
            </Section>

            <VouchaFooter uiLocale={locale} />
          </Container>
        </Body>
      </Html>
    )
  })()

CommunityInviteEmail.PreviewProps = {
  communityName: 'Travel Hackers',
  inviterName: 'John',
  code: 'abc12345',
}

async function renderCommunityInviteEmail(
  props: CommunityInviteEmailProps,
): EmailRenderResultPromise {
  const encodedCode = encodeURIComponent(props.code)
  const locale = resolveUiLocale(props.uiLocale)
  const copy = communityInviteCopyByLocale[locale]

  return {
    subject: copy.subject.replace('{communityName}', props.communityName),
    html: await render(<CommunityInviteEmail {...props} />, { pretty: true }),
    text: `${copy.textBody
      .replace('{inviterName}', props.inviterName)
      .replace(
        '{communityName}',
        props.communityName,
      )}\n\n${copy.textButton} ${baseUrl}/communities/invite/${encodedCode}\n\n${copy.textInviteCode} ${props.code}\n\n${copy.ignore}\n\n${getLocalizedSignoff(locale)}`,
  }
}

const RenderableCommunityInviteEmail = Object.assign(CommunityInviteEmail, {
  render: renderCommunityInviteEmail,
})
export default RenderableCommunityInviteEmail
