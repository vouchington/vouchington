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
  CommunityRoleChangeEmailProps,
  EmailRenderResultPromise,
  PreviewableEmailComponent,
} from './types.mts'

// oxlint-disable-next-line react/only-export-components
export const roleChangeCopyByLocale = {
  en: {
    subject: 'Your role in {communityName} has changed',
    button: 'View Community',
    textButton: 'View the community:',
    role: {
      owner: 'owner',
      moderator: 'moderator',
      member: 'member',
    },
    direction: {
      promoted: {
        preview: "You've been promoted to {role} in {communityName}",
        heading: "You've Been Promoted",
        body: "You've been promoted to {role} in {communityName}.",
        textBody: "You've been promoted to {role} in {communityName}.",
      },
      demoted: {
        preview: 'Your role in {communityName} was changed to {role}',
        heading: 'Your Role Has Changed',
        body: 'Your role in {communityName} was changed to {role}.',
        textBody: 'Your role in {communityName} was changed to {role}.',
      },
    },
  },
  es: {
    subject: 'Tu rol en {communityName} ha cambiado',
    button: 'Ver comunidad',
    textButton: 'Ver la comunidad:',
    role: {
      owner: 'propietario',
      moderator: 'moderador',
      member: 'miembro',
    },
    direction: {
      promoted: {
        preview: 'Has sido ascendido a {role} en {communityName}',
        heading: 'Has sido ascendido',
        body: 'Has sido ascendido a {role} en {communityName}.',
        textBody: 'Has sido ascendido a {role} en {communityName}.',
      },
      demoted: {
        preview: 'Tu rol en {communityName} cambió a {role}',
        heading: 'Tu rol ha cambiado',
        body: 'Tu rol en {communityName} cambió a {role}.',
        textBody: 'Tu rol en {communityName} cambió a {role}.',
      },
    },
  },
  fr: {
    subject: 'Votre rôle dans {communityName} a changé',
    button: 'Voir la communauté',
    textButton: 'Voir la communauté :',
    role: {
      owner: 'propriétaire',
      moderator: 'modérateur',
      member: 'membre',
    },
    direction: {
      promoted: {
        preview: 'Vous avez été promu {role} dans {communityName}',
        heading: 'Vous avez été promu',
        body: 'Vous avez été promu {role} dans {communityName}.',
        textBody: 'Vous avez été promu {role} dans {communityName}.',
      },
      demoted: {
        preview: 'Votre rôle dans {communityName} a été changé en {role}',
        heading: 'Votre rôle a changé',
        body: 'Votre rôle dans {communityName} a été changé en {role}.',
        textBody: 'Votre rôle dans {communityName} a été changé en {role}.',
      },
    },
  },
  pt: {
    subject: 'Seu cargo em {communityName} mudou',
    button: 'Ver comunidade',
    textButton: 'Ver a comunidade:',
    role: {
      owner: 'proprietário',
      moderator: 'moderador',
      member: 'membro',
    },
    direction: {
      promoted: {
        preview: 'Você foi promovido a {role} em {communityName}',
        heading: 'Você foi promovido',
        body: 'Você foi promovido a {role} em {communityName}.',
        textBody: 'Você foi promovido a {role} em {communityName}.',
      },
      demoted: {
        preview: 'Seu cargo em {communityName} foi alterado para {role}',
        heading: 'Seu cargo mudou',
        body: 'Seu cargo em {communityName} foi alterado para {role}.',
        textBody: 'Seu cargo em {communityName} foi alterado para {role}.',
      },
    },
  },
} as const

function interpolate(template: string, communityName: string, role: string): string {
  return template.replace('{role}', role).replace('{communityName}', communityName)
}

const CommunityRoleChangeEmail: PreviewableEmailComponent<CommunityRoleChangeEmailProps> = ({
  communityName,
  communityUrl,
  newRole,
  direction,
  uiLocale,
}) =>
  (() => {
    const locale = resolveUiLocale(uiLocale)
    const copy = roleChangeCopyByLocale[locale]
    const directionCopy = copy.direction[direction]
    const roleLabel = copy.role[newRole]

    return (
      <Html>
        <Head />
        <Preview>{interpolate(directionCopy.preview, communityName, roleLabel)}</Preview>
        <Body style={styles.main}>
          <Container style={styles.container}>
            <VouchaHeader />
            <Section style={styles.section}>
              <Text style={styles.heading}>{directionCopy.heading}</Text>
              <Text style={styles.paragraph}>
                {interpolate(directionCopy.body, communityName, roleLabel)}
              </Text>

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
  })()

CommunityRoleChangeEmail.PreviewProps = {
  communityName: 'Travel Hackers',
  communityUrl: 'https://voucha.ai/communities/travel-hackers',
  newRole: 'moderator',
  direction: 'promoted',
}

async function renderCommunityRoleChangeEmail(
  props: CommunityRoleChangeEmailProps,
): EmailRenderResultPromise {
  const locale = resolveUiLocale(props.uiLocale)
  const copy = roleChangeCopyByLocale[locale]
  const directionCopy = copy.direction[props.direction]
  const roleLabel = copy.role[props.newRole]

  return {
    subject: copy.subject.replace('{communityName}', props.communityName),
    html: await render(<CommunityRoleChangeEmail {...props} />, { pretty: true }),
    text: `${interpolate(directionCopy.textBody, props.communityName, roleLabel)}\n\n${copy.textButton} ${props.communityUrl}\n\n${getLocalizedSignoff(locale)}`,
  }
}

const RenderableCommunityRoleChangeEmail = Object.assign(CommunityRoleChangeEmail, {
  render: renderCommunityRoleChangeEmail,
})
export default RenderableCommunityRoleChangeEmail
