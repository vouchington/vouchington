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
  CommunityOwnershipTransferEmailProps,
  EmailRenderResultPromise,
  PreviewableEmailComponent,
} from './types.mts'

const CommunityOwnershipTransferEmail: PreviewableEmailComponent<
  CommunityOwnershipTransferEmailProps
> = ({ communityName, communityUrl, recipientRole, uiLocale }) =>
  (() => {
    const locale = resolveUiLocale(uiLocale)
    const t = emailCopy(locale, 'community-ownership-transfer')
    const vars = { communityName }

    return (
      <Html>
        <Head />
        <Preview>{t(`${recipientRole}.preview`, vars)}</Preview>
        <Body style={styles.main}>
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
  const locale = resolveUiLocale(props.uiLocale)
  const t = emailCopy(locale, 'community-ownership-transfer')
  const vars = { communityName: props.communityName }

  return {
    subject: t(`${props.recipientRole}.subject`, vars),
    html: await render(<CommunityOwnershipTransferEmail {...props} />, { pretty: true }),
    text: `${t(`${props.recipientRole}.textBody`, vars)}\n\n${t(`${props.recipientRole}.textButton`)} ${props.communityUrl}\n\n${getLocalizedSignoff(locale)}`,
  }
}

const RenderableCommunityOwnershipTransferEmail = Object.assign(CommunityOwnershipTransferEmail, {
  render: renderCommunityOwnershipTransferEmail,
})
export default RenderableCommunityOwnershipTransferEmail
