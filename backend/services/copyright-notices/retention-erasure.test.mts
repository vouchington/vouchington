import { describe, expect, it } from 'vitest'
import { useDsaTransparencyReports } from '@voucha/test-helpers/dsa-switches'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { createSettledCopyrightEuReportCase } from '@voucha/test-helpers/copyright-report-retention'
import { randomUUID } from 'node:crypto'
import {
  readCopyrightThreadTokenById,
  readCopyrightThreadTokenForIntake,
} from '@voucha/test-helpers/copyright-thread-retention'
import {
  findCopyrightRetentionGaps,
  readCopyrightRetentionColumns,
  readCopyrightRetentionMarker,
  readCopyrightRetentionSkeleton,
} from '@voucha/test-helpers/data-stores/psql/copyright-retention'
import { createRetentionAdministratorLiftCase } from '@voucha/test-helpers/copyright-retention-administrator-lift'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { createRetentionEmailCase } from '@voucha/test-helpers/services/copyright-notices/retention-email-case'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { recordThreadedCopyrightEmail } from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { addTestCopyrightSubmissionGuidanceForRetentionCase } from '@voucha/test-helpers/copyright-submission-guidance-retention'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { createRetentionFormCase } from '@voucha/test-helpers/services/copyright-notices/retention-form-case'
import {
  advanceCopyrightRetentionWorkPages,
  useCopyrightRetentionWorkClock,
} from '@voucha/test-helpers/copyright-retention-work'
import { readCopyrightStaffQueueCursorRows } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  readTestCopyrightScreeningCiphertexts,
  readTestCopyrightStaffScreening,
} from '@voucha/test-helpers/data-stores/psql/copyright-screening-executions'
import { getCopyrightStaffEmailIntake, loadCopyrightEmailRawEvidence } from './index.mts'
import {
  readTestRepeatInfringerIncidents,
  readTestRepeatInfringerOpenReviewIds,
} from '@voucha/test-helpers/copyright-repeat-infringer'
import { linkCopyrightEmailIntakeToNotice } from '@voucha/test-helpers/copyright-email-intake-link'
import { rejectCopyrightEmailCorrespondence } from './email-correspondence-admission.mts'

describe('copyright evidence retention erasure', () => {
  useAutomaticProvisionalWithholding()
  useDsaTransparencyReports()
  useCopyrightIntakeEnvironment()
  const bucket = useFakeCopyrightEvidenceBucket()
  const setClock = useCopyrightRetentionWorkClock()

  it('overwrites an eligible case and deletes every object version', async () => {
    const cases = await Promise.all([createRetentionEmailCase(), createRetentionFormCase()])
    await addTestCopyrightSubmissionGuidanceForRetentionCase(cases[1]!.noticeId)
    const noticeIds = cases.map(entry => entry.noticeId)
    const administratorLift = await createRetentionAdministratorLiftCase()
    const periodStart = new Date(Date.now() - 86_400_000)
    const periodEnd = new Date(Date.now() + 86_400_000)
    const territorial = await createSettledCopyrightEuReportCase(periodStart, periodEnd)
    const coverageNoticeIds = [...noticeIds, administratorLift.noticeId, territorial.noticeId]
    const retentionNow = new Date('2035-01-01T00:00:00.000Z')
    await setClock(retentionNow)
    for (const key of cases.flatMap(entry => entry.evidenceKeys)) {
      bucket.put(key, { versions: 3, deleteMarker: true })
    }
    const columns = await Promise.all(
      coverageNoticeIds.map(id => readCopyrightRetentionColumns(id)),
    )
    const skeletons = await Promise.all(noticeIds.map(id => readCopyrightRetentionSkeleton(id)))
    const incidents = await Promise.all(
      cases.map(entry => readTestRepeatInfringerIncidents(entry.posterId)),
    )
    const openReviewIds = await Promise.all(
      cases.map(entry => readTestRepeatInfringerOpenReviewIds(entry.posterId)),
    )
    // The form case holds a finished but failed delivery, which the staff queue lists.
    const [, formCase] = cases
    expect((await readCopyrightStaffQueueCursorRows(noticeIds)).map(row => row.id)).toEqual([
      formCase!.noticeId,
    ])

    const outcomes = await Promise.all(
      coverageNoticeIds.map(noticeId => advanceCopyrightRetentionWorkPages(noticeId)),
    )
    for (const pages of outcomes) expect(pages).toContain('erased')
    await expect(readCopyrightStaffQueueCursorRows(noticeIds)).resolves.toEqual([])
    for (const [index, entry] of cases.entries()) {
      for (const key of entry.evidenceKeys) expect(bucket.countVersions(key)).toBe(0)
      await expect(
        readCopyrightRetentionSkeleton(entry.noticeId, skeletons[index]),
      ).resolves.toEqual(skeletons[index])
      await expect(readTestRepeatInfringerIncidents(entry.posterId)).resolves.toEqual(
        incidents[index],
      )
      await expect(readTestRepeatInfringerOpenReviewIds(entry.posterId)).resolves.toEqual(
        openReviewIds[index],
      )
      await expect(readCopyrightRetentionMarker(entry.noticeId)).resolves.toEqual({
        retention_days: 2191,
        erased_object_count: entry.evidenceKeys.length,
      })
    }
    // Every table covered by erasure held a row in one of the fixtures, and each erasable
    // column of each row now differs from what it held, or is still null where it was null.
    const after = await Promise.all(
      coverageNoticeIds.map((id, index) => readCopyrightRetentionColumns(id, columns[index])),
    )
    expect(findCopyrightRetentionGaps(columns, after)).toEqual({
      uncovered: [],
      missing: [],
      unchanged: [],
    })
  })

  it('leaves the staff readers working on an erased case', async () => {
    const [emailCase, formCase] = await Promise.all([
      createRetentionEmailCase(),
      createRetentionFormCase(),
    ])
    const cases = [emailCase, formCase]
    await setClock(new Date('2035-01-01T00:00:00.000Z'))
    for (const key of cases.flatMap(entry => entry.evidenceKeys)) bucket.put(key)

    for (const entry of cases)
      expect(await advanceCopyrightRetentionWorkPages(entry.noticeId)).toContain('erased')

    await expect(
      getCopyrightStaffEmailIntake(emailCase.intakeId, emailCase.moderator),
    ).resolves.toMatchObject({ parsed_email: null, parser_error: null, recommendation: null })
    await expect(
      loadCopyrightEmailRawEvidence(emailCase.intakeId, emailCase.moderator),
    ).resolves.toBeNull()
    await expect(readTestCopyrightStaffScreening(formCase.noticeId)).resolves.toBeUndefined()
    await expect(readTestCopyrightScreeningCiphertexts(formCase.noticeId)).resolves.toEqual({
      rationale_ciphertext: 'erased',
      guidance_ciphertext: 'erased',
    })
  })

  it('keeps a shared token live for another case while severing the erased case', async () => {
    const sharedMessageId = `<${randomUUID()}@example.test>`
    const [erasedCase, liveCase] = await Promise.all([
      createRetentionEmailCase(),
      createRetentionEmailCase({ messageId: sharedMessageId }),
    ])
    await setClock(new Date('2035-01-01T00:00:00.000Z'))
    const matchedIntake = await createRetentionParsedEmail('shared-retention', { reply: true })
    await linkCopyrightEmailIntakeToNotice({
      intakeId: matchedIntake.id,
      noticeId: erasedCase.noticeId,
      linkKind: 'thread',
      matchedReference: sharedMessageId.slice(1, -1),
    })
    await rejectCopyrightEmailCorrespondence({
      currentUser: erasedCase.moderator,
      intakeId: matchedIntake.id,
      kind: 'supplement',
      rationale: 'The correspondence does not meet the filing requirements.',
      recommendationId: null,
      manualFallbackReason: 'No recommendation was available.',
    })
    for (const key of [...erasedCase.evidenceKeys, matchedIntake.raw_storage_key]) bucket.put(key)

    const sharedA = await readCopyrightThreadTokenForIntake(matchedIntake.id, 'matched')
    const sharedB = await readCopyrightThreadTokenForIntake(liveCase.intakeId, 'message_id')
    const exclusiveA = await readCopyrightThreadTokenForIntake(erasedCase.intakeId, 'message_id')
    expect(sharedA).toEqual(sharedB)
    expect(exclusiveA).not.toBeNull()

    // The newly linked and reviewed correspondence starts the same six-year case clock.
    await setClock(new Date('2042-01-01T00:00:00.000Z'))
    expect(await advanceCopyrightRetentionWorkPages(erasedCase.noticeId)).toContain('erased')
    await expect(readCopyrightThreadTokenForIntake(matchedIntake.id, 'matched')).resolves.toBeNull()
    await expect(
      readCopyrightThreadTokenForIntake(erasedCase.intakeId, 'message_id'),
    ).resolves.toBeNull()
    await expect(readCopyrightThreadTokenById(exclusiveA!.id)).resolves.not.toEqual(exclusiveA)
    await expect(readCopyrightThreadTokenById(sharedB!.id)).resolves.toEqual(sharedB)
    const reply = await recordThreadedCopyrightEmail({
      messageId: `<${randomUUID()}@example.test>`,
      replyReferences: [sharedMessageId],
    })
    expect(reply.match).toMatchObject({ noticeId: liveCase.noticeId })
  })
})
