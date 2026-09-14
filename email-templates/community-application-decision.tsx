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
  CommunityApplicationDecisionEmailProps,
  EmailRenderResultPromise,
  PreviewableEmailComponent,
} from './types.mts'

const CommunityApplicationDecisionEmail: PreviewableEmailComponent<
  CommunityApplicationDecisionEmailProps
> = ({ communityName, communityUrl, status, rejectionReason, uiLocale }) => {
  const locale = resolveUiLocale(uiLocale)
  const t = emailCopy(locale, 'community-application-decision')
  const vars = { communityName }

  return (
    <Html>
      <Head />
      <Preview>{t(`${status}.preview`, vars)}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <VouchaHeader />
          <Section style={styles.section}>
            <Text style={styles.heading}>{t(`${status}.heading`)}</Text>
            <Text style={styles.paragraph}>{t(`${status}.body`, vars)}</Text>

            {status === 'rejected' && rejectionReason ? (
              <Text style={styles.paragraph}>
                <strong>{t('rejected.reasonLabel')}</strong> {rejectionReason}
              </Text>
            ) : null}

            <Section style={styles.buttonContainer}>
              <Button
                href={communityUrl}
                style={styles.button}
              >
                {t(`${status}.button`)}
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
  const t = emailCopy(locale, 'community-application-decision')
  const vars = { communityName: props.communityName }
  const reasonLine =
    props.status === 'rejected' && props.rejectionReason
      ? `\n\n${t('rejected.reasonLabel')} ${props.rejectionReason}`
      : ''

  return {
    subject: t(`${props.status}.subject`, vars),
    html: await render(<CommunityApplicationDecisionEmail {...props} />, { pretty: true }),
    text: `${t(`${props.status}.textBody`, vars)}${reasonLine}\n\n${t(`${props.status}.textButton`)} ${props.communityUrl}\n\n${getLocalizedSignoff(locale)}`,
  }
}

const RenderableCommunityApplicationDecisionEmail = Object.assign(
  CommunityApplicationDecisionEmail,
  { render: renderCommunityApplicationDecisionEmail },
)
export default RenderableCommunityApplicationDecisionEmail
