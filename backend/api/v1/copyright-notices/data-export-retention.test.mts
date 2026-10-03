import { describe, expect, it } from 'vitest'
import { EXPORT_COPYRIGHT_ERASED_CIPHERTEXT } from '@services/account-data-requests/stream-copyright-erased'
import { sweepCopyrightEvidenceRetention } from '@services/copyright-notices'
import { COPYRIGHT_ERASED_CIPHERTEXT } from '@services/copyright-notices/erased-ciphertext'
import { readCopyrightRetentionColumns } from '@voucha/test-helpers/data-stores/psql/copyright-retention'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { readAccountExport } from '@voucha/test-helpers/services/copyright-notices/read-account-export'
import { useCopyrightRetentionConfig } from '@voucha/test-helpers/services/copyright-notices/retention-config'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { createRetentionFormCase } from '@voucha/test-helpers/services/copyright-notices/retention-form-case'

const DAY_MS = 24 * 60 * 60 * 1000
const OWN_FILING_FILES = [
  'copyright-notices-filed.csv',
  'copyright-appeals.csv',
  'copyright-counter-notices.csv',
]

describe('account data export after the copyright retention sweep', () => {
  useAutomaticProvisionalWithholding()
  const bucket = useFakeCopyrightEvidenceBucket()
  const configure = useCopyrightRetentionConfig()

  it('still exports both parties of an erased case, drops what the sweep erased, and states the erasure', async () => {
    await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 30 })
    const erasedCase = await createRetentionFormCase()
    for (const key of erasedCase.evidenceKeys) bucket.put(key)
    const { copyright_notice_form_intakes: intakes } = await readCopyrightRetentionColumns(
      erasedCase.noticeId,
    )
    const claimantId = intakes![0]!.requester_user_id as string
    const posterId = erasedCase.posterId
    const claimantBefore = await readAccountExport(claimantId)
    const posterBefore = await readAccountExport(posterId)
    expect(claimantBefore.rows('copyright-notices-filed.csv')).toEqual([
      expect.objectContaining({ notice_id: erasedCase.noticeId }),
    ])
    expect(posterBefore.rows('copyright-counter-notices.csv')).toHaveLength(1)
    expect(posterBefore.rows('copyright-cases.csv')).toEqual([
      expect.objectContaining({
        notice_id: erasedCase.noticeId,
        claimant_user_id: claimantId,
        erased_by_retention_at: '',
      }),
    ])

    const result = await sweepCopyrightEvidenceRetention({
      now: new Date(Date.now() + 400 * DAY_MS),
      noticeIds: [erasedCase.noticeId],
    })

    expect(result).toEqual({ erased: 1, ineligible: 0, failed: [] })
    const claimant = await readAccountExport(claimantId)
    const poster = await readAccountExport(posterId)
    for (const file of OWN_FILING_FILES) {
      expect(claimant.rows(file)).toEqual([])
      expect(poster.rows(file)).toEqual([])
    }
    expect(claimant.rows('copyright-cases.csv')).toEqual([])
    const [posterCase] = poster.rows('copyright-cases.csv')
    expect(posterCase).toMatchObject({
      notice_id: erasedCase.noticeId,
      viewer_role: 'poster',
      claimant_user_id: '',
      claimant_display_name: '',
    })
    expect(Number(posterCase!.erased_by_retention_at)).toBeGreaterThan(0)
    expect(poster.serialized).not.toContain(claimantId)
    expect(poster.rows('copyright-repeat-infringer-incidents.csv')).toEqual(
      posterBefore.rows('copyright-repeat-infringer-incidents.csv'),
    )
  }, 90_000)

  it('keeps the export package reading the same erased marker the sweep writes', () => {
    expect(EXPORT_COPYRIGHT_ERASED_CIPHERTEXT).toBe(COPYRIGHT_ERASED_CIPHERTEXT)
  })
})
