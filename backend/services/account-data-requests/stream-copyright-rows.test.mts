import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { encryptSecret } from '@modules/token-secrets'
import {
  type AppealBody,
  type CounterNoticeBody,
  EXPORT_COPYRIGHT_ERASED_TEXT,
  type FiledNoticeRow,
  appealExportRow,
  counterNoticeExportRow,
  filedNoticeExportRow,
} from './stream-copyright-rows.mts'

const ENCRYPTION_KEYS = 'test:raw32:this fake test key is not secret'
const INVALID = 'Invalid encrypted secret format'
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

describe('copyright export rows', () => {
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

  it('marks plaintext columns of an evidence-erased case but still decrypts its ciphertext', () => {
    const live = filedNoticeExportRow(filedRow())
    const erased = filedNoticeExportRow(filedRow({ erased_by_retention_at: ids.received_at }))
    expect(Object.keys(erased)).toEqual(Object.keys(live))
    expect(erased).toMatchObject({
      claimant_display_name: EXPORT_COPYRIGHT_ERASED_TEXT,
      work_description: EXPORT_COPYRIGHT_ERASED_TEXT,
      claimant_contact: '1 Claimant Road',
      electronic_signature: '/s/ Claimant',
      claimant_targets: [{ postId: 'p' }],
    })
  })

  it('checks every ciphertext of a filed notice, so a bad one fails the export', () => {
    expect(() =>
      filedNoticeExportRow(filedRow({ electronic_signature_ciphertext: 'bad' })),
    ).toThrow(INVALID)
    expect(() => filedNoticeExportRow(filedRow({ claimant_contact_ciphertext: 'bad' }))).toThrow(
      INVALID,
    )
    expect(() => filedNoticeExportRow(filedRow({ body_ciphertext: 'bad' }))).toThrow(INVALID)
  })

  it('exports appeals and counter-notices in full', () => {
    const appeal: AppealBody = { reason: 'My own photograph', targetIds: ['target-1'] }

    expect(appealExportRow(ids, appeal)).toEqual({
      ...ids,
      reason: 'My own photograph',
      target_ids: ['target-1'],
    })
    expect(counterNoticeExportRow(ids, counterNotice)).toMatchObject({
      name: 'Poster Name',
      consent_to_service_of_process: true,
      target_ids: ['target-1'],
    })
  })
})
