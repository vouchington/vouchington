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
import { VouchaFooter, VouchaHeader } from './components.tsx'
import { getLocalizedSignoff } from './locale.mts'
import { getRenewalPriceIncreaseContent } from './renewal-price-increase-copy.mts'
import { styles } from './styles.mts'
import type {
  EmailRenderResultPromise,
  PreviewableEmailComponent,
  RenewalPriceIncreaseEmailProps,
} from './types.mts'

const RenewalPriceIncreaseEmail: PreviewableEmailComponent<
  RenewalPriceIncreaseEmailProps
> = props =>
  (() => {
    const { locale, copy, body } = getRenewalPriceIncreaseContent(props)

    return (
      <Html>
        <Head />
        <Preview>{copy.preview}</Preview>
        <Body style={styles.main}>
          <Container style={styles.container}>
            <VouchaHeader />
            <Section style={styles.section}>
              <Text style={styles.heading}>{copy.heading}</Text>
              <Text style={styles.paragraph}>{body}</Text>
              <Section style={styles.buttonContainer}>
                <Button
                  href={props.membershipUrl}
                  style={styles.button}
                >
                  {copy.button}
                </Button>
              </Section>
              <Text style={styles.paragraph}>{copy.support}</Text>
            </Section>
            <VouchaFooter uiLocale={locale} />
          </Container>
        </Body>
      </Html>
    )
  })()

RenewalPriceIncreaseEmail.PreviewProps = {
  plan: 'plus',
  interval: 'month',
  currentPrice: { amount: 900, currency: 'usd' },
  newPrice: { amount: 1200, currency: 'usd' },
  renewsAt: '2026-08-01T00:00:00.000Z',
  membershipUrl: 'https://voucha.ai/my/membership',
}

async function renderRenewalPriceIncreaseEmail(
  props: RenewalPriceIncreaseEmailProps,
): EmailRenderResultPromise {
  const { locale, copy, plan, body } = getRenewalPriceIncreaseContent(props)
  return {
    subject: copy.subject(plan),
    html: await render(<RenewalPriceIncreaseEmail {...props} />, { pretty: true }),
    text: [
      copy.heading,
      '',
      body,
      '',
      `${copy.button}: ${props.membershipUrl}`,
      '',
      copy.support,
      '',
      getLocalizedSignoff(locale),
    ].join('\n'),
  }
}

const RenderableRenewalPriceIncreaseEmail = Object.assign(RenewalPriceIncreaseEmail, {
  render: renderRenewalPriceIncreaseEmail,
})
export default RenderableRenewalPriceIncreaseEmail
