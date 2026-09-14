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
import { emailCopy } from './catalog-copy.mts'
import { VouchaFooter, VouchaHeader } from './components.tsx'
import { getLocalizedSignoff, resolveUiLocale } from './locale.mts'
import { styles } from './styles.mts'
import type {
  CommunityRoleChangeEmailProps,
  EmailRenderResultPromise,
  PreviewableEmailComponent,
} from './types.mts'

const CommunityRoleChangeEmail: PreviewableEmailComponent<CommunityRoleChangeEmailProps> = ({
  communityName,
  communityUrl,
  newRole,
  direction,
  uiLocale,
}) =>
  (() => {
    const locale = resolveUiLocale(uiLocale)
    const t = emailCopy(locale, 'community-role-change')
    const vars = { communityName, role: t(`role.${newRole}`) }

    return (
      <Html>
        <Head />
        <Preview>{t(`direction.${direction}.preview`, vars)}</Preview>
        <Body style={styles.main}>
          <Container style={styles.container}>
            <VouchaHeader />
            <Section style={styles.section}>
              <Text style={styles.heading}>{t(`direction.${direction}.heading`)}</Text>
              <Text style={styles.paragraph}>{t(`direction.${direction}.body`, vars)}</Text>

              <Section style={styles.buttonContainer}>
                <Button
                  href={communityUrl}
                  style={styles.button}
                >
                  {t('button')}
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
  const t = emailCopy(locale, 'community-role-change')
  const vars = { communityName: props.communityName, role: t(`role.${props.newRole}`) }

  return {
    subject: t('subject', vars),
    html: await render(<CommunityRoleChangeEmail {...props} />, { pretty: true }),
    text: `${t(`direction.${props.direction}.textBody`, vars)}\n\n${t('textButton')} ${props.communityUrl}\n\n${getLocalizedSignoff(locale)}`,
  }
}

const RenderableCommunityRoleChangeEmail = Object.assign(CommunityRoleChangeEmail, {
  render: renderCommunityRoleChangeEmail,
})
export default RenderableCommunityRoleChangeEmail
