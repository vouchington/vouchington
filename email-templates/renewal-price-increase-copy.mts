import { resolveUiLocale, type UiLocale } from './locale.mts'
import type { RenewalPriceIncreaseEmailProps } from './types.mts'
import { getCurrency } from '@ts-shared/money'
import { emailCopy } from './catalog-copy.mts'

const intlLocaleByUiLocale: Record<UiLocale, string> = {
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  pt: 'pt-BR',
}

const renewalDateFormatters: Record<UiLocale, Intl.DateTimeFormat> = {
  en: createDateFormatter('en'),
  es: createDateFormatter('es'),
  fr: createDateFormatter('fr'),
  pt: createDateFormatter('pt'),
}
const priceFormatters = new Map<string, Intl.NumberFormat>()

export function getRenewalPriceIncreaseContent(props: RenewalPriceIncreaseEmailProps) {
  const locale = resolveUiLocale(props.uiLocale)
  const t = emailCopy(locale, 'renewal-price-increase')
  const plan = props.plan.slice(0, 1).toUpperCase() + props.plan.slice(1)
  const interval = props.interval === 'year' || props.interval === 'yearly' ? t('year') : t('month')
  const date = props.renewsAt instanceof Date ? props.renewsAt : new Date(props.renewsAt)
  const renewsAt = renewalDateFormatters[locale].format(date)
  const currentPrice = formatPrice(props.currentPrice, locale)
  const newPrice = formatPrice(props.newPrice, locale)
  return {
    locale,
    copy: {
      preview: t('preview'),
      heading: t('heading'),
      subject: (name: string) => t('subject', { plan: name }),
      button: t('button'),
      support: t('support'),
    },
    plan,
    body: t('body', { plan, date: renewsAt, oldPrice: currentPrice, newPrice, interval }),
  }
}

function createDateFormatter(locale: UiLocale): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(intlLocaleByUiLocale[locale], {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatPrice(
  price: RenewalPriceIncreaseEmailProps['currentPrice'],
  locale: UiLocale,
): string {
  const normalizedCurrency = price.currency.toUpperCase()
  const formatterKey = `${locale}:${normalizedCurrency}`
  let formatter = priceFormatters.get(formatterKey)
  if (!formatter) {
    const exponent = getCurrency(price.currency).minor_unit_exponent
    formatter = new Intl.NumberFormat(intlLocaleByUiLocale[locale], {
      style: 'currency',
      currency: normalizedCurrency,
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
    })
    priceFormatters.set(formatterKey, formatter)
  }
  const minorUnitDigits = getCurrency(price.currency).minor_unit_exponent
  const divisor = 10n ** BigInt(minorUnitDigits)
  const amount = BigInt(price.amount)
  const whole = amount / divisor
  const fraction = (amount % divisor).toString().padStart(minorUnitDigits, '0')
  return formatter
    .formatToParts(whole)
    .map(part => (part.type === 'fraction' ? fraction : part.value))
    .join('')
}
