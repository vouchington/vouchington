import { resolveUiLocale, type UiLocale } from './locale.mts'
import type { RenewalPriceIncreaseEmailProps } from './types.mts'
import { getCurrency } from '@ts-shared/money'

const intlLocaleByUiLocale: Record<UiLocale, string> = {
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  pt: 'pt-BR',
}

const copyByLocale = {
  en: {
    preview: 'Your renewal price is changing',
    heading: 'Your renewal price is changing',
    subject: (plan: string) => `Your Voucha ${plan} renewal price is changing`,
    body: (plan: string, date: string, oldPrice: string, newPrice: string, interval: string) =>
      `Your ${plan} membership renews on ${date}. The renewal price is changing from ${oldPrice} to ${newPrice} per ${interval}.`,
    button: 'Review Membership',
    support: 'You can review or change your membership before it renews.',
    month: 'month',
    year: 'year',
  },
  es: {
    preview: 'El precio de tu renovación va a cambiar',
    heading: 'El precio de tu renovación va a cambiar',
    subject: (plan: string) => `El precio de renovación de Voucha ${plan} va a cambiar`,
    body: (plan: string, date: string, oldPrice: string, newPrice: string, interval: string) =>
      `Tu membresía ${plan} se renueva el ${date}. El precio de renovación cambiará de ${oldPrice} a ${newPrice} por ${interval}.`,
    button: 'Revisar membresía',
    support: 'Puedes revisar o cambiar tu membresía antes de que se renueve.',
    month: 'mes',
    year: 'año',
  },
  fr: {
    preview: 'Le prix de votre renouvellement va changer',
    heading: 'Le prix de votre renouvellement va changer',
    subject: (plan: string) => `Le prix de renouvellement de Voucha ${plan} va changer`,
    body: (plan: string, date: string, oldPrice: string, newPrice: string, interval: string) =>
      `Votre abonnement ${plan} sera renouvelé le ${date}. Son prix passera de ${oldPrice} à ${newPrice} par ${interval}.`,
    button: "Consulter l'abonnement",
    support: 'Vous pouvez consulter ou modifier votre abonnement avant son renouvellement.',
    month: 'mois',
    year: 'an',
  },
  pt: {
    preview: 'O preço da sua renovação vai mudar',
    heading: 'O preço da sua renovação vai mudar',
    subject: (plan: string) => `O preço de renovação do Voucha ${plan} vai mudar`,
    body: (plan: string, date: string, oldPrice: string, newPrice: string, interval: string) =>
      `Sua assinatura ${plan} será renovada em ${date}. O preço da renovação mudará de ${oldPrice} para ${newPrice} por ${interval}.`,
    button: 'Revisar assinatura',
    support: 'Você pode revisar ou alterar sua assinatura antes da renovação.',
    month: 'mês',
    year: 'ano',
  },
} as const

const renewalDateFormatters: Record<UiLocale, Intl.DateTimeFormat> = {
  en: createDateFormatter('en'),
  es: createDateFormatter('es'),
  fr: createDateFormatter('fr'),
  pt: createDateFormatter('pt'),
}
const priceFormatters = new Map<string, Intl.NumberFormat>()

export function getRenewalPriceIncreaseContent(props: RenewalPriceIncreaseEmailProps) {
  const locale = resolveUiLocale(props.uiLocale)
  const copy = copyByLocale[locale]
  const plan = props.plan.slice(0, 1).toUpperCase() + props.plan.slice(1)
  const interval = props.interval === 'year' || props.interval === 'yearly' ? copy.year : copy.month
  const date = props.renewsAt instanceof Date ? props.renewsAt : new Date(props.renewsAt)
  const renewsAt = renewalDateFormatters[locale].format(date)
  const currentPrice = formatPrice(props.currentPrice, locale)
  const newPrice = formatPrice(props.newPrice, locale)
  const body = copy.body(plan, renewsAt, currentPrice, newPrice, interval)
  return { locale, copy, plan, body }
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
