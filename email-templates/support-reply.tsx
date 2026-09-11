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
import { VouchaFooter, VouchaHeader } from './components.tsx'
import { resolveUiLocale } from './locale.mts'
import { styles } from './styles.mts'
import type {
  EmailRenderResultPromise,
  PreviewableEmailComponent,
  SupportReplyEmailProps,
} from './types.mts'

// oxlint-disable-next-line react/only-export-components
export const supportReplyCopyByLocale = {
  en: {
    preview: 'A message from Voucha Support',
    signoff: '- Voucha Support Team',
    subject: 'Re: Your support request',
  },
  es: {
    preview: 'Un mensaje del equipo de soporte de Voucha',
    signoff: '- El equipo de soporte de Voucha',
    subject: 'Re: Tu solicitud de soporte',
  },
  fr: {
    preview: "Un message de l'équipe d'assistance Voucha",
    signoff: "- L'équipe d'assistance Voucha",
    subject: 'Re: Votre demande d’assistance',
  },
  pt: {
    preview: 'Uma mensagem da equipe de suporte da Voucha',
    signoff: '- Equipe de suporte da Voucha',
    subject: 'Re: Sua solicitação de suporte',
  },
} as const

const SupportReplyEmail: PreviewableEmailComponent<SupportReplyEmailProps> = ({
  bodyText,
  uiLocale,
}) => {
  const locale = resolveUiLocale(uiLocale)
  const copy = supportReplyCopyByLocale[locale]

  return (
    <Html>
      <Head />
      <Preview>{copy.preview}</Preview>
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
            <Text style={styles.paragraph}>{copy.signoff}</Text>
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
  const copy = supportReplyCopyByLocale[locale]
  return {
    subject: props.subject ?? copy.subject,
    html: await render(<SupportReplyEmail {...props} />, { pretty: true }),
    text: `${props.bodyText}\n\n${copy.signoff}`,
  }
}

const RenderableSupportReplyEmail = Object.assign(SupportReplyEmail, {
  render: renderSupportReplyEmail,
})

export default RenderableSupportReplyEmail
