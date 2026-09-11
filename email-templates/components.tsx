import { Section, Text } from './react-email-runtime.mts'
import { COPYRIGHT_YEAR, colors, styles } from './styles.mts'
import { getLocalizedFooterText, resolveUiLocale } from './locale.mts'
import type { LocalizedEmailProps } from './types.mts'

const headerWordmark = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: colors.primary,
  margin: '0',
  letterSpacing: '0.5px',
}

const headerSection = {
  padding: '16px 24px 0',
  textAlign: 'center' as const,
}

export function VouchaHeader() {
  return (
    <Section style={headerSection}>
      <Text style={headerWordmark}>Voucha</Text>
    </Section>
  )
}

export function VouchaFooter({ uiLocale }: LocalizedEmailProps) {
  const locale = resolveUiLocale(uiLocale)
  return (
    <Section style={styles.footer}>
      <Text style={styles.footerText}>{getLocalizedFooterText(locale, COPYRIGHT_YEAR)}</Text>
    </Section>
  )
}

// CAN-SPAM footer for commercial/marketing email — same copyright line as VouchaFooter,
// plus a required physical mailing address. See README.md § Templates for which
// templates require this footer.
export function MarketingFooter({
  uiLocale,
  physicalAddress,
}: LocalizedEmailProps & { physicalAddress: string }) {
  const locale = resolveUiLocale(uiLocale)
  return (
    <Section style={styles.footer}>
      <Text style={styles.footerText}>{getLocalizedFooterText(locale, COPYRIGHT_YEAR)}</Text>
      <Text style={styles.footerText}>{physicalAddress}</Text>
    </Section>
  )
}
