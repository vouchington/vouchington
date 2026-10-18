import {
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
import type { CommunityRoleChangeEmailProps } from './types.mts'

const CommunityRoleChangeEmail: PreviewableEmailComponent<CommunityRoleChangeEmailProps> = ({
  communityName,
  communityUrl,
  newRole,
  direction,
  uiLocale,
}) =>
  (() => {
    const locale = resolveEmailLocale(uiLocale, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE)
    const t = emailCopy(locale, 'community-role-change')
    const vars = { communityName, role: t(`role.${newRole}`) }

    return (
      <Html lang={locale}>
        <Head />
        <Preview>{t(`direction.${direction}.preview`, vars)}</Preview>
        <Body
          lang={locale}
          style={styles.main}
        >
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
  const locale = resolveEmailLocale(props.uiLocale, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE)
  const t = emailCopy(locale, 'community-role-change')
  const vars = { communityName: props.communityName, role: t(`role.${props.newRole}`) }

  return renderTemplateEmail({
    subject: t('subject', vars),
    element: <CommunityRoleChangeEmail {...props} />,
    pretty: true,
    text: `${t(`direction.${props.direction}.textBody`, vars)}\n\n${t('textButton')} ${props.communityUrl}\n\n${getLocalizedSignoff(locale)}`,
  })
}

const RenderableCommunityRoleChangeEmail = Object.assign(CommunityRoleChangeEmail, {
  render: renderCommunityRoleChangeEmail,
})
export default RenderableCommunityRoleChangeEmail
