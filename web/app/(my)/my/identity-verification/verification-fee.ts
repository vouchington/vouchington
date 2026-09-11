import { formatMoney } from '@/lib/money'
import { isCurrencyCode } from '@ts-shared/money'

export function formatVerificationFee(locale: string): string {
  const raw = process.env.IDENTITY_VERIFICATION_FEE_MINOR_UNITS ?? '500'
  if (!/^\d+$/.test(raw))
    throw new Error(`IDENTITY_VERIFICATION_FEE_MINOR_UNITS is not a valid integer: ${raw}`)
  const amount = Number.parseInt(raw, 10)
  const currency = process.env.IDENTITY_VERIFICATION_CURRENCY ?? 'usd'
  if (!isCurrencyCode(currency)) throw new Error(`Unsupported identity currency: ${currency}`)
  return formatMoney({ amount, currency }, locale)
}
