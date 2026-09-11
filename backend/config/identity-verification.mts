import { isCurrencyCode, type CurrencyCode } from '@ts-shared/money'

export const IDENTITY_VERIFICATION_FEE_MINOR_UNITS = (() => {
  const raw = process.env.IDENTITY_VERIFICATION_FEE_MINOR_UNITS ?? '500'
  if (!/^\d+$/.test(raw))
    throw new Error(
      `Invalid IDENTITY_VERIFICATION_FEE_MINOR_UNITS: "${raw}" (must be a non-negative integer)`,
    )
  const v = Number.parseInt(raw, 10)
  if (!Number.isSafeInteger(v) || v < 0)
    throw new Error(`Invalid IDENTITY_VERIFICATION_FEE_MINOR_UNITS: "${raw}"`)
  return v
})()
export const IDENTITY_VERIFICATION_CURRENCY: CurrencyCode = (() => {
  const value = process.env.IDENTITY_VERIFICATION_CURRENCY ?? 'usd'
  if (!isCurrencyCode(value)) {
    throw new Error(`Invalid IDENTITY_VERIFICATION_CURRENCY: "${value}"`)
  }
  return value
})()
export const IDENTITY_VERIFIED_VOTE_WEIGHT_BONUS = (() => {
  const raw = process.env.IDENTITY_VERIFIED_VOTE_WEIGHT_BONUS ?? '0.5'
  if (!/^\d+(\.\d+)?$/.test(raw))
    throw new Error(
      `Invalid IDENTITY_VERIFIED_VOTE_WEIGHT_BONUS: "${raw}" (must be a non-negative number)`,
    )
  const v = Number.parseFloat(raw)
  if (!Number.isFinite(v) || v < 0)
    throw new Error(`Invalid IDENTITY_VERIFIED_VOTE_WEIGHT_BONUS: "${raw}"`)
  return v
})()
