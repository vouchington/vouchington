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
import { emailCopy } from './catalog-copy.mts'
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

const CommunityInviteEmail: PreviewableEmailComponent<CommunityInviteEmailProps> = ({
  communityName,
  inviterName,
  code,
  uiLocale,
}) =>
  (() => {
    const locale = resolveUiLocale(uiLocale)
    const t = emailCopy(locale, 'community-invite')
    const vars = { communityName, inviterName }

    return (
      <Html>
        <Head />
        <Preview>{t('preview', vars)}</Preview>
        <Body style={styles.main}>
          <Container style={styles.container}>
            <VouchaHeader />
            <Section style={styles.section}>
              <Text style={styles.heading}>{t('heading')}</Text>
              <Text style={styles.paragraph}>
                <strong>{inviterName}</strong> {t('bodyVerb')} <strong>{communityName}</strong>{' '}
                {t('bodyTail')}
              </Text>

              <Section style={styles.buttonContainer}>
                <Link
                  href={`${baseUrl}/communities/invite/${encodeURIComponent(code)}`}
                  style={linkButton}
                >
                  {t('button')}
                </Link>
              </Section>

              <Text style={styles.paragraph}>
                {t('inviteCode')} <strong style={codeText}>{code}</strong>
              </Text>

              <Text style={styles.paragraph}>{t('ignore')}</Text>
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
  const t = emailCopy(locale, 'community-invite')
  const vars = { communityName: props.communityName, inviterName: props.inviterName }

  return {
    subject: t('subject', vars),
    html: await render(<CommunityInviteEmail {...props} />, { pretty: true }),
    text: `${t('textBody', vars)}\n\n${t('textButton')} ${baseUrl}/communities/invite/${encodedCode}\n\n${t('textInviteCode')} ${props.code}\n\n${t('ignore')}\n\n${getLocalizedSignoff(locale)}`,
  }
}

const RenderableCommunityInviteEmail = Object.assign(CommunityInviteEmail, {
  render: renderCommunityInviteEmail,
})
export default RenderableCommunityInviteEmail
