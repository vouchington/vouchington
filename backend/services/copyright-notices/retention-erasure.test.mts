import { describe, expect, it } from 'vitest'
import {
  findCopyrightRetentionGaps,
  readCopyrightRetentionColumns,
  readCopyrightRetentionMarker,
  readCopyrightRetentionSkeleton,
} from '@voucha/test-helpers/data-stores/psql/copyright-retention'
import { createRetentionAdministratorLiftCase } from '@voucha/test-helpers/copyright-retention-administrator-lift'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { createRetentionEmailCase } from '@voucha/test-helpers/services/copyright-notices/retention-email-case'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { createRetentionFormCase } from '@voucha/test-helpers/services/copyright-notices/retention-form-case'
import { useCopyrightRetentionConfig } from '@voucha/test-helpers/services/copyright-notices/retention-config'
import { readCopyrightStaffQueueCursorRows } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { readTestCopyrightStaffScreening } from '@voucha/test-helpers/data-stores/psql/copyright-screening-executions'
import {
  getCopyrightStaffEmailIntake,
  loadCopyrightEmailRawEvidence,
  sweepCopyrightEvidenceRetention,
} from './index.mts'
import { getCopyrightRepeatInfringerAccount } from './repeat-infringer-incidents.mts'

const DAY_MS = 24 * 60 * 60 * 1000
const afterRetention = () => new Date(Date.now() + 400 * DAY_MS)

describe('copyright evidence retention sweep', () => {
  useAutomaticProvisionalWithholding()
  const bucket = useFakeCopyrightEvidenceBucket()
  const configure = useCopyrightRetentionConfig()

  it('overwrites the personal data of an eligible case and deletes every object version', async () => {
    await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 30 })
    const cases = await Promise.all([createRetentionEmailCase(), createRetentionFormCase()])
    const noticeIds = cases.map(entry => entry.noticeId)
    const administratorLift = await createRetentionAdministratorLiftCase()
    const coverageNoticeIds = [...noticeIds, administratorLift.noticeId]
    for (const key of cases.flatMap(entry => entry.evidenceKeys)) {
      bucket.put(key, { versions: 3, deleteMarker: true })
    }
    const columns = await Promise.all(coverageNoticeIds.map(readCopyrightRetentionColumns))
    const skeletons = await Promise.all(noticeIds.map(readCopyrightRetentionSkeleton))
    const incidents = await Promise.all(
      cases.map(entry => getCopyrightRepeatInfringerAccount(entry.posterId)),
    )
    // The form case holds a finished but failed delivery, which the staff queue lists.
    const [, formCase] = cases
    expect((await readCopyrightStaffQueueCursorRows(noticeIds)).map(row => row.id)).toEqual([
      formCase!.noticeId,
    ])

    const result = await sweepCopyrightEvidenceRetention({
      now: afterRetention(),
      noticeIds: coverageNoticeIds,
    })

    expect(result).toEqual({ erased: 3, ineligible: 0, failed: [] })
    await expect(readCopyrightStaffQueueCursorRows(noticeIds)).resolves.toEqual([])
    for (const [index, entry] of cases.entries()) {
      for (const key of entry.evidenceKeys) expect(bucket.countVersions(key)).toBe(0)
      await expect(readCopyrightRetentionSkeleton(entry.noticeId)).resolves.toEqual(
        skeletons[index],
      )
      await expect(getCopyrightRepeatInfringerAccount(entry.posterId)).resolves.toEqual(
        incidents[index],
      )
      await expect(readCopyrightRetentionMarker(entry.noticeId)).resolves.toEqual({
        retention_days: 30,
        erased_object_count: entry.evidenceKeys.length,
      })
    }
    // Every table the sweep covers held a row in one of the fixtures, and each erasable
    // column of each row now differs from what it held, or is still null where it was null.
    const after = await Promise.all(coverageNoticeIds.map(readCopyrightRetentionColumns))
    expect(findCopyrightRetentionGaps(columns, after)).toEqual({
      uncovered: [],
      missing: [],
      unchanged: [],
    })
  })

  it('leaves the staff readers working on an erased case', async () => {
    await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 30 })
    const [emailCase, formCase] = await Promise.all([
      createRetentionEmailCase(),
      createRetentionFormCase(),
    ])
    const cases = [emailCase, formCase]
    for (const key of cases.flatMap(entry => entry.evidenceKeys)) bucket.put(key)

    await sweepCopyrightEvidenceRetention({
      now: afterRetention(),
      noticeIds: cases.map(entry => entry.noticeId),
    })

    await expect(
      getCopyrightStaffEmailIntake(emailCase.intakeId, emailCase.moderator),
    ).resolves.toMatchObject({ parsed_email: null, parser_error: null, recommendation: null })
    await expect(
      loadCopyrightEmailRawEvidence(emailCase.intakeId, emailCase.moderator),
    ).resolves.toBeNull()
    await expect(readTestCopyrightStaffScreening(formCase.noticeId)).resolves.toMatchObject({
      rationale: '[erased]',
      guidance: null,
    })
  })
})
