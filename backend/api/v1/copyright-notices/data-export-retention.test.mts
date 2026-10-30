import { describe, expect, it } from 'vitest'
import { readCopyrightRetentionColumns } from '@voucha/test-helpers/data-stores/psql/copyright-retention'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { readAccountExport } from '@voucha/test-helpers/services/copyright-notices/read-account-export'
import {
  advanceCopyrightRetentionWorkPages,
  useCopyrightRetentionWorkClock,
} from '@voucha/test-helpers/copyright-retention-work'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { createRetentionFormCase } from '@voucha/test-helpers/services/copyright-notices/retention-form-case'

const OWN_FILING_FILES = [
  'copyright-notices-filed.csv',
  'copyright-appeals.csv',
  'copyright-counter-notices.csv',
]

describe('account data export after copyright retention erasure', () => {
  useAutomaticProvisionalWithholding()
  const bucket = useFakeCopyrightEvidenceBucket()
  const setClock = useCopyrightRetentionWorkClock()

  it('still exports both parties of an erased case, omits protected filings, and states erasure', async () => {
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

    const aggregate = await getCopyrightNoticePrivateAggregate(erasedCase.noticeId)
    if (!aggregate || aggregate.lifecycleEvents.length === 0) {
      throw new Error('retention fixture lifecycle is missing')
    }
    const lastLifecycleAt = Math.max(
      ...aggregate.lifecycleEvents.map(event => event.created_at.getTime()),
    )
    await setClock(new Date(lastLifecycleAt + 7 * 365 * 24 * 60 * 60 * 1000))
    expect(await advanceCopyrightRetentionWorkPages(erasedCase.noticeId)).toContain('erased')
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
  })
})
