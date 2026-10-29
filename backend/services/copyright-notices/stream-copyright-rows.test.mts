import { describe, expect, it } from 'vitest'
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
  filedNoticeExportRow,
  appealExportRow,
  counterNoticeExportRow,
} from './stream-copyright-rows.mts'
import { createCopyrightExportFiledRowFixture } from '@voucha/test-helpers/copyright-export-rows'

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
  it('decrypts live fields with the real owner key and states erased content explicitly', async () => {
    await using fixture = await createCopyrightExportFiledRowFixture()
    const purpose = `copyright-form:${fixture.row.idempotency_key}`
    expect(
      decryptExportedCopyrightText(
        fixture.row.claimant_contact_ciphertext,
        purpose,
        fixture.secrets,
      ),
    ).toBe('1 Export Way')
    expect(
      decryptExportedCopyrightJson<{ claimant_targets: Array<{ postId: string }> }>(
        fixture.row.body_ciphertext,
        purpose,
        fixture.secrets,
      ),
    ).toEqual({ claimant_targets: [{ postId: expect.any(String) }] })

    const live = filedNoticeExportRow(fixture.row, fixture.secrets)
    expect(live).toEqual({
      notice_id: fixture.row.notice_id,
      received_at: fixture.row.received_at,
      jurisdiction: 'us_dmca',
      claimant_display_name: 'Export fixture claimant',
      claimant_contact: '1 Export Way',
      work_description: 'Export fixture photograph',
      has_good_faith_belief: true,
      has_accuracy_authority_under_penalty_of_perjury: true,
      electronic_signature: '/s/ Export fixture claimant',
      claimant_targets: [{ postId: expect.any(String) }],
    })

    const erased = filedNoticeExportRow(
      {
        ...fixture.row,
        erased_by_retention_at: fixture.row.received_at,
        claimant_display_name: ERASED,
        claimant_contact_ciphertext: ERASED,
        work_description: ERASED,
        electronic_signature_ciphertext: ERASED,
        body_ciphertext: ERASED,
      },
      null,
    )
    expect(Object.keys(erased)).toEqual(Object.keys(live))
    expect(erased).toMatchObject({
      claimant_display_name: EXPORT_COPYRIGHT_ERASED_TEXT,
      claimant_contact: EXPORT_COPYRIGHT_ERASED_TEXT,
      work_description: EXPORT_COPYRIGHT_ERASED_TEXT,
      electronic_signature: EXPORT_COPYRIGHT_ERASED_TEXT,
      claimant_targets: EXPORT_COPYRIGHT_ERASED_TEXT,
      has_good_faith_belief: true,
    })
    expect(EXPORT_COPYRIGHT_ERASED_TEXT).toContain('retention policy')
    expect(erasedExportFields(['a', 'b'])).toEqual({
      a: EXPORT_COPYRIGHT_ERASED_TEXT,
      b: EXPORT_COPYRIGHT_ERASED_TEXT,
    })
  })

  it('fails closed when live content lacks its owner key or has invalid owner ciphertext', async () => {
    await using fixture = await createCopyrightExportFiledRowFixture()
    expect(() => filedNoticeExportRow(fixture.row, null)).toThrow(/no owner key/)
    for (const field of [
      'claimant_contact_ciphertext',
      'electronic_signature_ciphertext',
      'body_ciphertext',
    ] as const)
      expect(() =>
        filedNoticeExportRow({ ...fixture.row, [field]: 'not-a-ciphertext' }, fixture.secrets),
      ).toThrow('Copyright ciphertext does not belong to its owner')
  })

  it('does not decrypt a different owner key as this notice', async () => {
    await using first = await createCopyrightExportFiledRowFixture()
    await using second = await createCopyrightExportFiledRowFixture()
    expect(() =>
      filedNoticeExportRow(
        { ...first.row, claimant_contact_ciphertext: second.row.claimant_contact_ciphertext },
        first.secrets,
      ),
    ).toThrow(/does not belong to its owner/)
  })

  it.each([
    { erasedAt: null, expected: ERASED },
    { erasedAt: ids.received_at, expected: EXPORT_COPYRIGHT_ERASED_TEXT },
  ])('preserves literal erased plaintext markers ($erasedAt)', async ({ erasedAt, expected }) => {
    await using fixture = await createCopyrightExportFiledRowFixture()
    const exported = filedNoticeExportRow(
      {
        ...fixture.row,
        claimant_display_name: ERASED,
        work_description: ERASED,
        erased_by_retention_at: erasedAt,
      },
      fixture.secrets,
    )
    expect(exported).toMatchObject({
      claimant_display_name: expected,
      work_description: expected,
    })
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
