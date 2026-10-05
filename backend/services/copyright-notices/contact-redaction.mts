import { isValidCardNumber, isValidIban } from './payment-checks.mts'
import {
  cardNumber,
  dateOfBirth,
  emailAddress,
  ibanNumber,
  labelledIdNumber,
  phoneNumber,
  postOfficeBox,
  preservedText,
  socialSecurityNumber,
  streetAddress,
} from './personal-detail-patterns.mts'

// One pass over the text. At a given position the first alternative wins, so preserved legal
// references come first, and card/SSN/IBAN shapes come before the phone shapes they resemble.
const personalOrPreservedText = new RegExp(
  [
    `(?<preserved>${preservedText})`,
    dateOfBirth,
    labelledIdNumber,
    `(?<address>${streetAddress}|${postOfficeBox})`,
    `(?<ssn>${socialSecurityNumber})`,
    `(?<card>${cardNumber})`,
    `(?<iban>${ibanNumber})`,
    `(?<email>${emailAddress})`,
    `(?<phone>${phoneNumber})`,
  ].join('|'),
  'gi',
)

type Groups = Partial<
  Record<
    'preserved' | 'dobLabel' | 'idPrefix' | 'address' | 'ssn' | 'card' | 'iban' | 'email',
    string
  >
>

/**
 * Strip contact and personal details before sanitizing or hashing external filing text:
 * email addresses, phone numbers, postal addresses, government ID numbers, dates of birth, and
 * payment-card and IBAN numbers. Names, URLs, other dates, and case/docket numbers stay.
 */
export function stripPersonalDetails(text: string): string {
  return text.replace(personalOrPreservedText, (match: string, ...rest: unknown[]) => {
    const groups = rest.at(-1) as Groups
    if (groups.preserved) return match
    if (groups.dobLabel) return `${groups.dobLabel}[date of birth removed]`
    if (groups.idPrefix) return `${groups.idPrefix}[ID number removed]`
    if (groups.address) return '[address removed]'
    if (groups.ssn) return '[ID number removed]'
    if (groups.card) return isValidCardNumber(match) ? '[payment details removed]' : match
    if (groups.iban) return isValidIban(match) ? '[payment details removed]' : match
    return groups.email ? '[email removed]' : '[phone removed]'
  })
}
