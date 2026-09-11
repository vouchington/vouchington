import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  render,
} from './react-email-runtime.mts'
import { getLocalizedFooterText, resolveUiLocale } from './locale.mts'
import { copyByLocale } from './crm-outreach-copy.mts'
import {
  bodyStyle,
  container,
  ctaButton,
  ctaContainer,
  footer,
  footerLink,
  footerText,
  greeting,
  heroImage,
  imageContainer,
  main,
  section,
  signature,
} from './crm-outreach-styles.mts'
import { COPYRIGHT_YEAR } from './styles.mts'
import type {
  CrmOutreachEmailProps,
  EmailRenderResultPromise,
  PreviewableEmailComponent,
} from './types.mts'

// Preview-only component — uses plain text body for the preview server.
// Actual HTML emails are rendered via renderCrmOutreachEmail which injects bodyHtml.
const CrmOutreachEmail: PreviewableEmailComponent<CrmOutreachEmailProps> = ({
  contactName,
  senderName,
  bodyHtml,
  ctaUrl,
  ctaLabel,
  imageUrl,
  unsubscribeUrl,
  physicalAddress,
  uiLocale,
}) =>
  (() => {
    const locale = resolveUiLocale(uiLocale)
    const copy = copyByLocale[locale]

    return (
      <Html>
        <Head />
        <Preview>{copy.preview(senderName)}</Preview>
        <Body style={main}>
          <Container style={container}>
            <Section style={section}>
              {imageUrl && (
                <Section style={imageContainer}>
                  <Img
                    src={imageUrl}
                    alt=''
                    style={heroImage}
                  />
                </Section>
              )}

              <Text style={greeting}>{copy.greeting(contactName)}</Text>

              <Text style={bodyStyle}>
                {bodyHtml
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim()}
              </Text>

              {ctaUrl && (
                <Section style={ctaContainer}>
                  <Link
                    href={ctaUrl}
                    style={ctaButton}
                  >
                    {ctaLabel ?? copy.learnMore}
                  </Link>
                </Section>
              )}

              <Text style={signature}>{copy.signoff(senderName)}</Text>
            </Section>

            <Section style={footer}>
              <Text style={footerText}>{getLocalizedFooterText(locale, COPYRIGHT_YEAR)}</Text>
              <Text style={footerText}>{physicalAddress}</Text>
              <Text style={footerText}>
                <Link
                  href={unsubscribeUrl}
                  style={footerLink}
                >
                  {copy.unsubscribe}
                </Link>
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    )
  })()

CrmOutreachEmail.PreviewProps = {
  contactName: 'Jane Smith',
  senderName: 'John',
  bodyHtml:
    "<p>I wanted to reach out about a collaboration opportunity with Voucha.</p><p>We think your audience would love what we're building.</p>",
  ctaUrl: 'https://voucha.ai',
  ctaLabel: 'Learn More',
  imageUrl: undefined,
  unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
  physicalAddress: '123 Placeholder St, Suite 100, San Francisco, CA 94105',
}

const BODY_SLOT = '__CRM_BODY_SLOT__'

async function renderCrmOutreachEmail(props: CrmOutreachEmailProps): EmailRenderResultPromise {
  const locale = resolveUiLocale(props.uiLocale)
  const copy = copyByLocale[locale]
  const subjectLine = copy.subject(props.senderName)

  // Render the structural shell with a slot placeholder for the body HTML
  const shellProps = { ...props, bodyHtml: BODY_SLOT }
  const shellHtml = await render(<CrmOutreachEmail {...shellProps} />, { pretty: true })

  // Replace the slot with the actual body HTML (admin/AI-generated, not end-user input)
  const html = shellHtml.replace(BODY_SLOT, props.bodyHtml)

  const text = [
    copy.greeting(props.contactName),
    '',
    props.bodyHtml
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    '',
    props.ctaUrl ? `${props.ctaLabel ?? copy.learnMore}: ${props.ctaUrl}` : '',
    '',
    copy.signoff(props.senderName),
    '',
    `${copy.unsubscribe}: ${props.unsubscribeUrl}`,
    '',
    props.physicalAddress,
  ]
    .filter(line => line !== undefined)
    .join('\n')

  return { subject: subjectLine, html, text }
}

const RenderableCrmOutreachEmail = Object.assign(CrmOutreachEmail, {
  render: renderCrmOutreachEmail,
})
export default RenderableCrmOutreachEmail
