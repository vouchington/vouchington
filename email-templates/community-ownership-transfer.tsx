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
import type { CommunityOwnershipTransferEmailProps } from './types.mts'

const CommunityOwnershipTransferEmail: PreviewableEmailComponent<
  CommunityOwnershipTransferEmailProps
> = ({ communityName, communityUrl, recipientRole, uiLocale }) =>
  (() => {
    const locale = resolveEmailLocale(uiLocale, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE)
    const t = emailCopy(locale, 'community-ownership-transfer')
    const vars = { communityName }

    return (
      <Html lang={locale}>
        <Head />
        <Preview>{t(`${recipientRole}.preview`, vars)}</Preview>
        <Body
          lang={locale}
          style={styles.main}
        >
          <Container style={styles.container}>
            <VouchaHeader />
            <Section style={styles.section}>
              <Text style={styles.heading}>{t(`${recipientRole}.heading`)}</Text>
              <Text style={styles.paragraph}>{t(`${recipientRole}.body`, vars)}</Text>

              <Section style={styles.buttonContainer}>
                <Button
                  href={communityUrl}
                  style={styles.button}
                >
                  {t(`${recipientRole}.button`)}
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
  const locale = resolveEmailLocale(props.uiLocale, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE)
  const t = emailCopy(locale, 'community-ownership-transfer')
  const vars = { communityName: props.communityName }

  return renderTemplateEmail({
    subject: t(`${props.recipientRole}.subject`, vars),
    element: <CommunityOwnershipTransferEmail {...props} />,
    pretty: true,
    text: `${t(`${props.recipientRole}.textBody`, vars)}\n\n${t(`${props.recipientRole}.textButton`)} ${props.communityUrl}\n\n${getLocalizedSignoff(locale)}`,
  })
}

const RenderableCommunityOwnershipTransferEmail = Object.assign(CommunityOwnershipTransferEmail, {
  render: renderCommunityOwnershipTransferEmail,
})
export default RenderableCommunityOwnershipTransferEmail
