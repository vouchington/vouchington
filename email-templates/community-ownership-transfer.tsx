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
  CommunityOwnershipTransferEmailProps,
  EmailRenderResultPromise,
  PreviewableEmailComponent,
} from './types.mts'

// oxlint-disable-next-line react/only-export-components
export const ownershipTransferCopyByLocale = {
  en: {
    new_owner: {
      preview: 'You are now the owner of {communityName}',
      heading: "You're the new owner",
      body: 'Congratulations! You are now the owner of {communityName}. As the owner, you can manage community settings, moderate content, and assign roles to other members.',
      button: 'View community',
      subject: 'Ownership of {communityName} has changed',
      textBody:
        'Congratulations! You are now the owner of {communityName}. As the owner, you can manage community settings, moderate content, and assign roles to other members.',
      textButton: 'View community:',
    },
    previous_owner: {
      preview: 'Ownership of {communityName} has been transferred',
      heading: 'Ownership transferred',
      body: 'Ownership of {communityName} has been transferred to another member. You remain a member of the community.',
      button: 'View community',
      subject: 'Ownership of {communityName} has changed',
      textBody:
        'Ownership of {communityName} has been transferred to another member. You remain a member of the community.',
      textButton: 'View community:',
    },
  },
  es: {
    new_owner: {
      preview: 'Ahora eres el propietario de {communityName}',
      heading: 'Ahora eres el propietario',
      body: '¡Felicidades! Ahora eres el propietario de {communityName}. Como propietario, puedes gestionar la configuración de la comunidad, moderar el contenido y asignar roles a otros miembros.',
      button: 'Ver comunidad',
      subject: 'La propiedad de {communityName} ha cambiado',
      textBody:
        '¡Felicidades! Ahora eres el propietario de {communityName}. Como propietario, puedes gestionar la configuración de la comunidad, moderar el contenido y asignar roles a otros miembros.',
      textButton: 'Ver comunidad:',
    },
    previous_owner: {
      preview: 'La propiedad de {communityName} ha sido transferida',
      heading: 'Propiedad transferida',
      body: 'La propiedad de {communityName} ha sido transferida a otro miembro. Sigues siendo miembro de la comunidad.',
      button: 'Ver comunidad',
      subject: 'La propiedad de {communityName} ha cambiado',
      textBody:
        'La propiedad de {communityName} ha sido transferida a otro miembro. Sigues siendo miembro de la comunidad.',
      textButton: 'Ver comunidad:',
    },
  },
  fr: {
    new_owner: {
      preview: 'Vous êtes maintenant propriétaire de {communityName}',
      heading: 'Vous êtes le nouveau propriétaire',
      body: 'Félicitations ! Vous êtes maintenant propriétaire de {communityName}. En tant que propriétaire, vous pouvez gérer les paramètres de la communauté, modérer le contenu et attribuer des rôles aux autres membres.',
      button: 'Voir la communauté',
      subject: 'La propriété de {communityName} a changé',
      textBody:
        'Félicitations ! Vous êtes maintenant propriétaire de {communityName}. En tant que propriétaire, vous pouvez gérer les paramètres de la communauté, modérer le contenu et attribuer des rôles aux autres membres.',
      textButton: 'Voir la communauté :',
    },
    previous_owner: {
      preview: 'La propriété de {communityName} a été transférée',
      heading: 'Propriété transférée',
      body: 'La propriété de {communityName} a été transférée à un autre membre. Vous restez membre de la communauté.',
      button: 'Voir la communauté',
      subject: 'La propriété de {communityName} a changé',
      textBody:
        'La propriété de {communityName} a été transférée à un autre membre. Vous restez membre de la communauté.',
      textButton: 'Voir la communauté :',
    },
  },
  pt: {
    new_owner: {
      preview: 'Agora você é o proprietário de {communityName}',
      heading: 'Você é o novo proprietário',
      body: 'Parabéns! Agora você é o proprietário de {communityName}. Como proprietário, você pode gerenciar as configurações da comunidade, moderar conteúdo e atribuir funções a outros membros.',
      button: 'Ver comunidade',
      subject: 'A propriedade de {communityName} mudou',
      textBody:
        'Parabéns! Agora você é o proprietário de {communityName}. Como proprietário, você pode gerenciar as configurações da comunidade, moderar conteúdo e atribuir funções a outros membros.',
      textButton: 'Ver comunidade:',
    },
    previous_owner: {
      preview: 'A propriedade de {communityName} foi transferida',
      heading: 'Propriedade transferida',
      body: 'A propriedade de {communityName} foi transferida para outro membro. Você continua sendo membro da comunidade.',
      button: 'Ver comunidade',
      subject: 'A propriedade de {communityName} mudou',
      textBody:
        'A propriedade de {communityName} foi transferida para outro membro. Você continua sendo membro da comunidade.',
      textButton: 'Ver comunidade:',
    },
  },
} as const

const CommunityOwnershipTransferEmail: PreviewableEmailComponent<
  CommunityOwnershipTransferEmailProps
> = ({ communityName, communityUrl, recipientRole, uiLocale }) =>
  (() => {
    const locale = resolveUiLocale(uiLocale)
    const copy = ownershipTransferCopyByLocale[locale][recipientRole]

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

CommunityOwnershipTransferEmail.PreviewProps = {
  communityName: 'Travel Hackers',
  communityUrl: 'https://voucha.ai/communities/travel-hackers',
  recipientRole: 'new_owner',
}

async function renderCommunityOwnershipTransferEmail(
  props: CommunityOwnershipTransferEmailProps,
): EmailRenderResultPromise {
  const locale = resolveUiLocale(props.uiLocale)
  const copy = ownershipTransferCopyByLocale[locale][props.recipientRole]

  return {
    subject: copy.subject.replace('{communityName}', props.communityName),
    html: await render(<CommunityOwnershipTransferEmail {...props} />, { pretty: true }),
    text: `${copy.textBody.replace('{communityName}', props.communityName)}\n\n${copy.textButton} ${props.communityUrl}\n\n${getLocalizedSignoff(locale)}`,
  }
}

const RenderableCommunityOwnershipTransferEmail = Object.assign(CommunityOwnershipTransferEmail, {
  render: renderCommunityOwnershipTransferEmail,
})
export default RenderableCommunityOwnershipTransferEmail
