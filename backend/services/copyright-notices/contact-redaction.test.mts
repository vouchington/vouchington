import { describe, expect, it } from 'vitest'
import { stripContactDetails } from './contact-redaction.mts'

describe('copyright filing contact redaction', () => {
  it.each([
    ['jane@example.test', '[email removed]'],
    ['JANE+case@sub.example.test', '[email removed]'],
    ['+1 (555) 010-0100', '[phone removed]'],
    ['555-0100', '[phone removed]'],
    ['555.010.0100', '[phone removed]'],
    ['555 010 0100', '[phone removed]'],
    ['1-555-010-0100', '[phone removed]'],
    ['(555)010-0100', '[phone removed]'],
    ['5550100100', '[phone removed]'],
    ['+15550100100', '[phone removed]'],
    ['+44 20 7946 0958', '[phone removed]'],
  ])('redacts %s', (input, expected) => {
    expect(stripContactDetails(`Contact: ${input}.`)).toBe(`Contact: ${expected}.`)
  })

  it.each([
    '2026-07-02',
    '07/02/2026',
    '1:26-cv-01234',
    'Docket No. 123-4567',
    'Case number 2026-123-4567',
    '17 U.S.C. § 512(g)',
    'https://court.example.test/555-0100?email=jane@example.test',
    'www.court.example.test/555.010.0100',
  ])('preserves the legal reference or URL %s', input => {
    expect(stripContactDetails(input)).toBe(input)
  })

  it('redacts contacts around a preserved docket and URL', () => {
    expect(
      stripContactDetails(
        'Email jane@example.test or john@example.test; call +1 (555) 010-0100. Filed 2026-07-02 as 1:26-cv-01234. See https://example.test/555-0100.',
      ),
    ).toBe(
      'Email [email removed] or [email removed]; call [phone removed]. Filed 2026-07-02 as 1:26-cv-01234. See https://example.test/555-0100.',
    )
  })

  it('gives the same redacted model input for filings differing only in contacts', () => {
    expect(stripContactDetails('Filed by jane@example.test; call 555-0100.')).toBe(
      stripContactDetails('Filed by john@another.test; call 555-0199.'),
    )
  })

  it('is idempotent and retains ordinary names and postal text', () => {
    const redacted = stripContactDetails('Jane Doe, 123 Main Street; jane@example.test.')
    expect(redacted).toBe('Jane Doe, 123 Main Street; [email removed].')
    expect(stripContactDetails(redacted)).toBe(redacted)
  })
})
