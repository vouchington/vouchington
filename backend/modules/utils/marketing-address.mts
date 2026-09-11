export const MARKETING_POSTAL_ADDRESS_PLACEHOLDER = '[Voucha mailing address — pending; see #7113]'

export function getMarketingPostalAddress(): string {
  return process.env.MARKETING_POSTAL_ADDRESS || MARKETING_POSTAL_ADDRESS_PLACEHOLDER
}
