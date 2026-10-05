import { describe, expect, it } from 'vitest'
import type { CopyrightStaffEmailIntake } from '@services/copyright-notices/read-models'
import type { CopyrightStaffQueueCase } from '@services/copyright-notices/read-models-staff-types'
import {
  redactCopyrightContactFields,
  redactCopyrightEmailIntake,
  redactCopyrightQueueCase,
} from './copyright-redaction.mts'

const email = 'claimant@example.test'
const phone = '415-555-0181'

describe('copyright MCP read redaction', () => {
  it('keeps queue keys and names while masking contact and stripping contact from narrative fields', () => {
    const staffCase = {
      id: crypto.randomUUID(),
      received_at: new Date(),
      jurisdiction: 'us_dmca',
      reasons: ['counter_notice_review'],
      waiting_since: new Date(),
      next_deadline: null,
      claimant: { display_name: 'Claimant Name', contact: email, misuse: null },
      work_description: `Copied image; contact ${email}`,
      targets: [],
      evidence: [],
      form_review: null,
      restrictions: [],
      action_intents: [],
      delivery_intents: [],
      staydown_matches: [],
      email_correspondence: [],
      appeals: [
        {
          submission_id: crypto.randomUUID(),
          reason: `Call ${phone}`,
          target_ids: [],
          recommendation: null,
        },
      ],
      counter_notices: [
        {
          submission_id: crypto.randomUUID(),
          received_at: new Date(),
          target_ids: [],
          guidance: null,
          statement: {
            name: 'Poster Name',
            electronic_signature: 'Poster Signature',
            address: '1 Test St',
            telephone: phone,
            explanation: `Write ${email}`,
          },
        },
      ],
      legal_holds: [
        {
          submission_id: crypto.randomUUID(),
          received_at: new Date(),
          guidance: null,
          assessment: null,
          statement: { name: 'Counsel Name', address: '2 Test St', note: `Call ${phone}` },
        },
      ],
    } satisfies CopyrightStaffQueueCase
    const result = redactCopyrightQueueCase(staffCase)
    expect(result.claimant).toMatchObject({ display_name: 'Claimant Name', contact: '[redacted]' })
    expect(result.work_description).not.toContain(email)
    expect(result.appeals[0]?.reason).not.toContain(phone)
    expect(result.counter_notices[0]?.statement).toMatchObject({
      name: 'Poster Name',
      electronic_signature: 'Poster Signature',
      address: '[redacted]',
      telephone: '[redacted]',
    })
    expect(result.counter_notices[0]?.statement['explanation']).not.toContain(email)
    expect(result.legal_holds[0]?.statement).toMatchObject({
      name: 'Counsel Name',
      address: '[redacted]',
    })
    expect(result.legal_holds[0]?.statement['note']).not.toContain(phone)
    expect(staffCase.claimant.contact).toBe(email)
    expect(
      redactCopyrightContactFields({ territorial: { notifier: { name: 'Notifier Name', email } } }),
    ).toEqual({ territorial: { notifier: { name: 'Notifier Name', email: '[redacted]' } } })
  })

  it('returns only the D3 intake projection and removes contact evidence before output wrapping', () => {
    const intake = {
      id: crypto.randomUUID(),
      received_at: new Date(),
      review_path: 'initial',
      linked_notice: null,
      ses_verdicts: { spf: 'pass', dkim: 'pass', dmarc: 'pass', spam: 'pass', virus: 'pass' },
      raw_email: { mime_type: 'message/rfc822', byte_size: 100, sha256: 'a', download_url: '/raw' },
      parsed_email: { sender_email: email, subject: 'subject', body_text: 'raw email' },
      parser_error: `Parse failed for ${email}`,
      recommendation: {
        id: crypto.randomUUID(),
        structured_output: {
          claimant_name: 'Claimant Name',
          claimant_contact: '1 Test St',
          claimant_email: email,
          counter_notice_name: 'Poster Name',
          counter_notice_address: '2 Test St',
          counter_notice_telephone: phone,
          counter_notice_electronic_signature: 'Poster Signature',
          submission_summary: `Please call ${phone}`,
          appeal_reason: `Email ${email}`,
          work_description: `Contact ${email}`,
          moderator_reasoning: `Phone ${phone}`,
          missing_information: [`Email ${email}`],
          source_evidence: [
            { field: 'claimant_email', excerpt: email },
            { field: 'counter_notice_address', excerpt: '2 Test St' },
            { field: 'counter_notice_name', excerpt: `Poster Name ${email}` },
          ],
        },
      },
    } satisfies CopyrightStaffEmailIntake
    const result = redactCopyrightEmailIntake(intake)
    expect(result).not.toHaveProperty('raw_email')
    expect(result).not.toHaveProperty('parsed_email')
    expect(result).not.toHaveProperty('parser_error')
    const output = result.recommendation?.structured_output
    expect(output).toMatchObject({
      claimant_name: 'Claimant Name',
      claimant_contact: '[redacted]',
      claimant_email: '[redacted]',
      counter_notice_name: 'Poster Name',
      counter_notice_address: '[redacted]',
      counter_notice_telephone: '[redacted]',
      counter_notice_electronic_signature: 'Poster Signature',
    })
    expect(output?.['source_evidence']).toEqual([
      { field: 'counter_notice_name', excerpt: 'Poster Name [email removed]' },
    ])
    for (const key of [
      'submission_summary',
      'appeal_reason',
      'work_description',
      'moderator_reasoning',
    ])
      expect(output?.[key]).not.toContain(
        key === 'submission_summary' || key === 'moderator_reasoning' ? phone : email,
      )
    expect(output?.['missing_information']).toEqual(['Email [email removed]'])
  })
})
