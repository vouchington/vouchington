import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { encryptSecret } from '@modules/token-secrets'
import {
  EXPORT_COPYRIGHT_ERASED_CIPHERTEXT,
  EXPORT_COPYRIGHT_ERASED_TEXT,
  decryptExportedCopyrightJson,
  decryptExportedCopyrightText,
  erasedExportFields,
} from './stream-copyright-erased.mts'
import {
  type AppealBody,
  type CounterNoticeBody,
  type FiledNoticeRow,
  appealExportRow,
  counterNoticeExportRow,
  filedNoticeExportRow,
} from './stream-copyright-rows.mts'

const ENCRYPTION_KEYS = 'test:raw32:this fake test key is not secret'
const INVALID = 'Invalid encrypted secret format'
const ERASED = EXPORT_COPYRIGHT_ERASED_CIPHERTEXT
const ids = {
  submission_id: '019c8390-0000-7000-8000-000000000010',
  notice_id: '019c8390-0000-7000-8000-000000000011',
  received_at: new Date('2026-02-22T00:00:00.000Z'),
}
const counterNotice: CounterNoticeBody = {
  name: 'Poster Name',
  address: '1 Poster Way',
  telephone: '555-0100',
  consentToFederalJurisdiction: true,
  consentToServiceOfProcess: true,
  goodFaithMisidentificationUnderPenaltyOfPerjury: true,
  electronicSignature: '/s/ Poster Name',
  targetIds: ['target-1'],
}

describe('copyright export rows that tolerate erased content', () => {
  let previousKeys: string | undefined

  beforeEach(() => {
    previousKeys = process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS
    process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = ENCRYPTION_KEYS
  })

  afterEach(() => {
    if (previousKeys === undefined) delete process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS
    else process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = previousKeys
  })

  function filedRow(overrides: Partial<FiledNoticeRow> = {}): FiledNoticeRow {
    const purpose = 'copyright-form:key-1'
    return {
      notice_id: ids.notice_id,
      received_at: ids.received_at,
      jurisdiction: 'us_dmca',
      erased_by_retention_at: null,
      claimant_display_name: 'Claimant Legal Name',
      claimant_contact_ciphertext: encryptSecret('1 Claimant Road', purpose),
      work_description: 'Original photograph',
      idempotency_key: 'key-1',
      has_good_faith_belief: true,
      has_accuracy_authority_under_penalty_of_perjury: true,
      electronic_signature_ciphertext: encryptSecret('/s/ Claimant', purpose),
      body_ciphertext: encryptSecret(
        JSON.stringify({ claimant_targets: [{ postId: 'p' }] }),
        purpose,
      ),
      ...overrides,
    }
  }

  it('decrypts live text and JSON, and states the erasure for erased content', () => {
    const live = encryptSecret('hello', 'purpose')
    expect(decryptExportedCopyrightText(live, 'purpose')).toBe('hello')
    expect(decryptExportedCopyrightText(ERASED, 'purpose')).toBe(EXPORT_COPYRIGHT_ERASED_TEXT)
    expect(
      decryptExportedCopyrightJson<{ a: number }>(encryptSecret('{"a":1}', 'purpose'), 'purpose'),
    ).toEqual({ a: 1 })
    expect(decryptExportedCopyrightJson(ERASED, 'purpose')).toBeNull()
    expect(EXPORT_COPYRIGHT_ERASED_TEXT).toContain('retention policy')
    expect(erasedExportFields(['a', 'b'])).toEqual({
      a: EXPORT_COPYRIGHT_ERASED_TEXT,
      b: EXPORT_COPYRIGHT_ERASED_TEXT,
    })
  })

  it('still fails the export on a ciphertext that is neither erased nor decryptable', () => {
    expect(() => decryptExportedCopyrightText('not-a-ciphertext', 'purpose')).toThrow(INVALID)
    expect(() => decryptExportedCopyrightJson('not-a-ciphertext', 'purpose')).toThrow(INVALID)
    expect(() => decryptExportedCopyrightText(encryptSecret('x', 'other'), 'purpose')).toThrow(
      /authenticate/,
    )
  })

  it('exports a live filed notice in full', () => {
    expect(filedNoticeExportRow(filedRow())).toEqual({
      notice_id: ids.notice_id,
      received_at: ids.received_at,
      jurisdiction: 'us_dmca',
      claimant_display_name: 'Claimant Legal Name',
      claimant_contact: '1 Claimant Road',
      work_description: 'Original photograph',
      has_good_faith_belief: true,
      has_accuracy_authority_under_penalty_of_perjury: true,
      electronic_signature: '/s/ Claimant',
      claimant_targets: [{ postId: 'p' }],
    })
  })

  it.each([
    { erasedAt: null, expected: ERASED },
    { erasedAt: ids.received_at, expected: EXPORT_COPYRIGHT_ERASED_TEXT },
  ])(
    'uses the retention marker for literal erased plaintext ($erasedAt)',
    ({ erasedAt, expected }) => {
      const exported = filedNoticeExportRow(
        filedRow({
          claimant_display_name: ERASED,
          work_description: ERASED,
          erased_by_retention_at: erasedAt,
        }),
      )
      expect(exported).toMatchObject({
        claimant_display_name: expected,
        work_description: expected,
      })
    },
  )

  it('exports an erased filed notice with the same columns and the erasure stated in each', () => {
    const erased = filedNoticeExportRow(
      filedRow({
        erased_by_retention_at: ids.received_at,
        claimant_display_name: ERASED,
        claimant_contact_ciphertext: ERASED,
        work_description: ERASED,
        electronic_signature_ciphertext: ERASED,
        body_ciphertext: ERASED,
      }),
    )

    expect(Object.keys(erased)).toEqual(Object.keys(filedNoticeExportRow(filedRow())))
    expect(erased).toMatchObject({
      claimant_display_name: EXPORT_COPYRIGHT_ERASED_TEXT,
      claimant_contact: EXPORT_COPYRIGHT_ERASED_TEXT,
      work_description: EXPORT_COPYRIGHT_ERASED_TEXT,
      electronic_signature: EXPORT_COPYRIGHT_ERASED_TEXT,
      claimant_targets: EXPORT_COPYRIGHT_ERASED_TEXT,
      has_good_faith_belief: true,
    })
  })

  it('checks every ciphertext of a filed notice, so a partly erased row cannot hide a bad one', () => {
    expect(() =>
      filedNoticeExportRow(filedRow({ electronic_signature_ciphertext: 'bad' })),
    ).toThrow(INVALID)
    expect(() => filedNoticeExportRow(filedRow({ claimant_contact_ciphertext: 'bad' }))).toThrow(
      INVALID,
    )
    expect(() => filedNoticeExportRow(filedRow({ body_ciphertext: 'bad' }))).toThrow(INVALID)
  })

  it('exports live and erased appeals and counter-notices with identical columns', () => {
    const appeal: AppealBody = { reason: 'My own photograph', targetIds: ['target-1'] }

    expect(appealExportRow(ids, appeal)).toEqual({
      ...ids,
      reason: 'My own photograph',
      target_ids: ['target-1'],
    })
    expect(appealExportRow(ids, null)).toEqual({
      ...ids,
      reason: EXPORT_COPYRIGHT_ERASED_TEXT,
      target_ids: EXPORT_COPYRIGHT_ERASED_TEXT,
    })
    const live = counterNoticeExportRow(ids, counterNotice)
    const erased = counterNoticeExportRow(ids, null)
    expect(live).toMatchObject({ name: 'Poster Name', consent_to_service_of_process: true })
    expect(Object.keys(erased)).toEqual(Object.keys(live))
    expect(Object.values(erased).slice(3)).toEqual(
      Object.keys(live)
        .slice(3)
        .map(() => EXPORT_COPYRIGHT_ERASED_TEXT),
    )
  })
})
