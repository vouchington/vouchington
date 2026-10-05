import { describe, expect, it } from 'vitest'
import { stripPersonalDetails } from './contact-redaction.mts'

describe('copyright filing postal address redaction', () => {
  it.each([
    ['123 Main Street', '[address removed]'],
    ['9 Oak Ave', '[address removed]'],
    ['456 Pine Rd., Suite 12', '[address removed]'],
    ['78 N. Lakeview Blvd Apt 4B', '[address removed]'],
    ['5 Cedar Court', '[address removed]'],
    ['1600 Pennsylvania Avenue, Washington, DC 20500', '[address removed]'],
    ['22 Elm Lane, Springfield, IL 62701-1234', '[address removed]'],
    ['P.O. Box 1234', '[address removed]'],
    ['PO Box 77, Austin, TX 73301', '[address removed]'],
  ])('redacts %s', (input, expected) => {
    expect(stripPersonalDetails(`Mail to ${input} today.`)).toBe(`Mail to ${expected} today.`)
  })

  it.each([
    '17 U.S.C. § 512(g)',
    'Filed 3 motions in court on 12 March 2026.',
    'The Court cited 2 Supreme Court decisions and 5 District Court rulings.',
    'Filed in the 2026 Federal Court docket.',
    'Order 5 Federal Rule 65 applies.',
    'Docket No. 123 Main Street',
    'Superior Court of California, County of Los Angeles, claim 12345.',
  ])('keeps the legal text %s', input => {
    expect(stripPersonalDetails(input)).toBe(input)
  })
})

describe('copyright filing government ID redaction', () => {
  it.each([
    ['123-45-6789', '[ID number removed]'],
    ['SSN 123-45-6789', 'SSN [ID number removed]'],
    ['SSN: 123456789', 'SSN: [ID number removed]'],
    ['Social Security number is 123456789', 'Social Security number is [ID number removed]'],
    ['passport no. X1234567', 'passport no. [ID number removed]'],
    ["driver's license D123-4567-8901", "driver's license [ID number removed]"],
    ['Driver’s Licence: D1234567', 'Driver’s Licence: [ID number removed]'],
    ['national ID 1234-5678', 'national ID [ID number removed]'],
    ['Tax ID 12-3456789', 'Tax ID [ID number removed]'],
    ['EIN 12-3456789', 'EIN [ID number removed]'],
    ['TIN: 123456789', 'TIN: [ID number removed]'],
  ])('redacts %s', (input, expected) => {
    expect(stripPersonalDetails(`Filer ${input}.`)).toBe(`Filer ${expected}.`)
  })

  it.each([
    'passport photo attached',
    'Social Security Administration records',
    'the tin can and ein',
    'Case no. 123-45-6789',
    'Docket No. 123-45-6789',
    'claim 123-45-6789',
    'Case number 2026-123-4567',
    'passport 12',
  ])('keeps %s', input => {
    expect(stripPersonalDetails(input)).toBe(input)
  })
})

describe('copyright filing date of birth redaction', () => {
  it.each([
    ['DOB: 04/15/1980', 'DOB: [date of birth removed]'],
    ['DOB 1980-04-15', 'DOB [date of birth removed]'],
    ['D.O.B. 1/2/80', 'D.O.B. [date of birth removed]'],
    ['date of birth is April 15, 1980', 'date of birth is [date of birth removed]'],
    ['Birth date: 15th of April 1980', 'Birth date: [date of birth removed]'],
    ['born on 15 April 1980', 'born on [date of birth removed]'],
    ['was born in Texas on Apr. 15, 1980', 'was born in Texas on [date of birth removed]'],
  ])('redacts %s', (input, expected) => {
    expect(stripPersonalDetails(`Plaintiff ${input}.`)).toBe(`Plaintiff ${expected}.`)
  })

  it('keeps other dates, including the same format as a date of birth', () => {
    const text = 'Filed 04/15/2026 and 2026-07-02; notice March 4, 2026. DOB 04/15/1980.'
    expect(stripPersonalDetails(text)).toBe(
      'Filed 04/15/2026 and 2026-07-02; notice March 4, 2026. DOB [date of birth removed].',
    )
  })

  it.each([
    'born in Texas, filed 2026-07-02',
    'Born to run: 2026-07-02',
    'born in 1980',
    'DOB 1:26-cv-01234',
    'the order of 04/15/1980',
  ])('keeps %s', input => {
    expect(stripPersonalDetails(input)).toBe(input)
  })
})

describe('copyright filing payment detail redaction', () => {
  it.each([
    '4111 1111 1111 1111',
    '4111-1111-1111-1111',
    '4111111111111111',
    '3782 822463 10005',
    '6011000990139424',
    'GB82 WEST 1234 5698 7654 32',
    'DE89370400440532013000',
    'NO93 8601 1117 947',
  ])('redacts %s', input => {
    expect(stripPersonalDetails(`Paid with ${input}.`)).toBe('Paid with [payment details removed].')
  })

  it.each([
    '4111 1111 1111 1112',
    '4111-1111-1111-1112',
    '4111111111111112',
    'GB00 WEST 1234 5698 7654 32',
    'AB12 CDEF 1234',
    'gb82 west 1234 5698 7654 32',
    '41111111111111111111111',
  ])('keeps the Luhn- or IBAN-invalid number %s', input => {
    expect(stripPersonalDetails(`Paid with ${input}.`)).toBe(`Paid with ${input}.`)
  })

  it('does not take an IBAN-shaped all-caps word after the number', () => {
    expect(stripPersonalDetails('GB82 WEST 1234 5698 7654 32 AND THEN')).toBe(
      '[payment details removed] AND THEN',
    )
  })

  it('still redacts a phone number next to a card number', () => {
    expect(stripPersonalDetails('Card 4111 1111 1111 1111, phone 555-010-0100.')).toBe(
      'Card [payment details removed], phone [phone removed].',
    )
  })
})

describe('copyright filing sample paragraph', () => {
  const filing = [
    'Jane Doe v. Acme Media LLC, Docket No. 1:26-cv-01234, filed 07/02/2026.',
    'The plaintiff lives at 456 Oak Avenue, Springfield, IL 62701 (DOB 04/15/1980; SSN 123-45-6789)',
    'and paid the filing fee with card 4111 1111 1111 1111.',
    'Reach her at jane@example.test or +1 (555) 010-0100; see https://court.example.test/1:26-cv-01234.',
  ].join(' ')

  it('replaces every category and keeps the party name, docket number, and filing date', () => {
    expect(stripPersonalDetails(filing)).toBe(
      [
        'Jane Doe v. Acme Media LLC, Docket No. 1:26-cv-01234, filed 07/02/2026.',
        'The plaintiff lives at [address removed] (DOB [date of birth removed]; SSN [ID number removed])',
        'and paid the filing fee with card [payment details removed].',
        'Reach her at [email removed] or [phone removed]; see https://court.example.test/1:26-cv-01234.',
      ].join(' '),
    )
  })

  it('is idempotent', () => {
    const once = stripPersonalDetails(filing)
    expect(stripPersonalDetails(once)).toBe(once)
  })

  it('gives the same redacted model input for filings differing only in personal details', () => {
    const other = filing
      .replace('456 Oak Avenue, Springfield, IL 62701', '9 Birch Way, Peoria, IL 61602')
      .replace('04/15/1980', '11/30/1975')
      .replace('123-45-6789', '987-65-4321')
      .replace('4111 1111 1111 1111', '5555 5555 5555 4444')
    expect(stripPersonalDetails(other)).toBe(stripPersonalDetails(filing))
  })
})
