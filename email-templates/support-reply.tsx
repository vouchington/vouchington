import {
  Body,
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
import { resolveUiLocale } from './locale.mts'
import { styles } from './styles.mts'
import type {
  EmailRenderResultPromise,
  PreviewableEmailComponent,
  SupportReplyEmailProps,
} from './types.mts'

const SupportReplyEmail: PreviewableEmailComponent<SupportReplyEmailProps> = ({
  bodyText,
  uiLocale,
}) => {
  const locale = resolveUiLocale(uiLocale)
  const t = emailCopy(locale, 'support-reply')

  return (
    <Html>
      <Head />
      <Preview>{t('preview')}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <VouchaHeader />
          <Section style={styles.section}>
            {bodyText.split('\n').map((line, lineIndex) => (
              <Text
                // oxlint-disable-next-line react/no-array-index-key
                key={lineIndex}
                style={styles.paragraph}
              >
                {line || '\u00A0'}
              </Text>
            ))}
            <Text style={styles.paragraph}>{t('signoff')}</Text>
          </Section>
          <VouchaFooter uiLocale={locale} />
        </Container>
      </Body>
    </Html>
  )
}

SupportReplyEmail.PreviewProps = {
  bodyText:
    'Thank you for reaching out to Voucha Support.\n\nWe have reviewed your request and will get back to you shortly.',
  subject: 'Re: Your support request',
}

async function renderSupportReplyEmail(props: SupportReplyEmailProps): EmailRenderResultPromise {
  const locale = resolveUiLocale(props.uiLocale)
  const t = emailCopy(locale, 'support-reply')
  return {
    subject: props.subject ?? t('subject'),
    html: await render(<SupportReplyEmail {...props} />, { pretty: true }),
    text: `${props.bodyText}\n\n${t('signoff')}`,
  }
}

const RenderableSupportReplyEmail = Object.assign(SupportReplyEmail, {
  render: renderSupportReplyEmail,
})

export default RenderableSupportReplyEmail
