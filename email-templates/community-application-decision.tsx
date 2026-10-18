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
import type { CommunityApplicationDecisionEmailProps } from './types.mts'

const CommunityApplicationDecisionEmail: PreviewableEmailComponent<
  CommunityApplicationDecisionEmailProps
> = ({ communityName, communityUrl, status, rejectionReason, uiLocale }) => {
  const locale = resolveEmailLocale(uiLocale, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE)
  const t = emailCopy(locale, 'community-application-decision')
  const vars = { communityName }

  return (
    <Html lang={locale}>
      <Head />
      <Preview>{t(`${status}.preview`, vars)}</Preview>
      <Body
        lang={locale}
        style={styles.main}
      >
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
  const locale = resolveEmailLocale(props.uiLocale, SUPPORTED_UI_LOCALES, DEFAULT_UI_LOCALE)
  const t = emailCopy(locale, 'community-application-decision')
  const vars = { communityName: props.communityName }
  const reasonLine =
    props.status === 'rejected' && props.rejectionReason
      ? `\n\n${t('rejected.reasonLabel')} ${props.rejectionReason}`
      : ''

  return renderTemplateEmail({
    subject: t(`${props.status}.subject`, vars),
    element: <CommunityApplicationDecisionEmail {...props} />,
    pretty: true,
    text: `${t(`${props.status}.textBody`, vars)}${reasonLine}\n\n${t(`${props.status}.textButton`)} ${props.communityUrl}\n\n${getLocalizedSignoff(locale)}`,
  })
}

const RenderableCommunityApplicationDecisionEmail = Object.assign(
  CommunityApplicationDecisionEmail,
  { render: renderCommunityApplicationDecisionEmail },
)
export default RenderableCommunityApplicationDecisionEmail
