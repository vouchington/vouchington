import { describe, expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import {
  getAgentCallReceipt,
  reserveAgentCallReceipt,
  completeAgentCallReceipt,
} from '@services/ai-usage/agent-call-receipts'
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
import { useCopyrightRetentionConfig } from '@voucha/test-helpers/services/copyright-notices/retention-config'
import { readCopyrightStaffQueueCursorRows } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { readTestCopyrightStaffScreening } from '@voucha/test-helpers/data-stores/psql/copyright-screening-executions'
import {
  getCopyrightStaffEmailIntake,
  loadCopyrightEmailRawEvidence,
  sweepCopyrightEvidenceRetention,
} from './index.mts'
import { getCopyrightRepeatInfringerAccount } from './repeat-infringer-incidents.mts'
import { linkCopyrightEmailIntakeToNotice } from './email-threading.mts'
import { normalizeCopyrightEmailReference } from './email-thread-references.mts'

const DAY_MS = 24 * 60 * 60 * 1000
const afterRetention = () => new Date(Date.now() + 400 * DAY_MS)

describe('copyright evidence retention sweep', () => {
  useAutomaticProvisionalWithholding()
  const bucket = useFakeCopyrightEvidenceBucket()
  const configure = useCopyrightRetentionConfig()

  it('overwrites the personal data of an eligible case and deletes every object version', async () => {
    await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 30 })
    const cases = await Promise.all([createRetentionEmailCase(), createRetentionFormCase()])
    const { counterSubmissionId } = await addTestCopyrightSubmissionGuidanceForRetentionCase(
      cases[1]!.noticeId,
    )
    const receiptKey = createHash('sha256').update(randomUUID()).digest('hex')
    expect(
      await reserveAgentCallReceipt(
        receiptKey,
        'copyright-submission-guidance',
        'a'.repeat(64),
        counterSubmissionId,
      ),
    ).toBe(true)
    await completeAgentCallReceipt(receiptKey, 'encrypted private guidance fixture')
    const noticeIds = cases.map(entry => entry.noticeId)
    const administratorLift = await createRetentionAdministratorLiftCase()
    const coverageNoticeIds = [...noticeIds, administratorLift.noticeId]
    for (const key of cases.flatMap(entry => entry.evidenceKeys)) {
      bucket.put(key, { versions: 3, deleteMarker: true })
    }
    const columns = await Promise.all(
      coverageNoticeIds.map(id => readCopyrightRetentionColumns(id)),
    )
    const skeletons = await Promise.all(noticeIds.map(id => readCopyrightRetentionSkeleton(id)))
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
    await expect(getAgentCallReceipt(receiptKey)).resolves.toMatchObject({
      result_ciphertext: 'erased',
    })
    const lateReceiptKey = createHash('sha256').update(randomUUID()).digest('hex')
    await expect(
      reserveAgentCallReceipt(
        lateReceiptKey,
        'copyright-submission-guidance',
        'a'.repeat(64),
        counterSubmissionId,
      ),
    ).rejects.toThrow('erased by retention')
    await expect(getAgentCallReceipt(lateReceiptKey)).resolves.toBeUndefined()
    await expect(readCopyrightStaffQueueCursorRows(noticeIds)).resolves.toEqual([])
    for (const [index, entry] of cases.entries()) {
      for (const key of entry.evidenceKeys) expect(bucket.countVersions(key)).toBe(0)
      await expect(
        readCopyrightRetentionSkeleton(entry.noticeId, skeletons[index]),
      ).resolves.toEqual(skeletons[index])
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

  it('keeps a shared token live for another case while severing the erased case', async () => {
    await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 30 })
    const sharedMessageId = `<${randomUUID()}@example.test>`
    const [erasedCase, liveCase] = await Promise.all([
      createRetentionEmailCase(),
      createRetentionEmailCase({ messageId: sharedMessageId }),
    ])
    const matchedIntake = await createRetentionParsedEmail('shared-retention', { reply: true })
    await linkCopyrightEmailIntakeToNotice({
      intakeId: matchedIntake.id,
      noticeId: erasedCase.noticeId,
      linkKind: 'thread',
      matchedReference: normalizeCopyrightEmailReference(sharedMessageId),
    })
    for (const key of [...erasedCase.evidenceKeys, matchedIntake.raw_storage_key]) bucket.put(key)

    const sharedA = await readCopyrightThreadTokenForIntake(matchedIntake.id, 'matched')
    const sharedB = await readCopyrightThreadTokenForIntake(liveCase.intakeId, 'message_id')
    const exclusiveA = await readCopyrightThreadTokenForIntake(erasedCase.intakeId, 'message_id')
    expect(sharedA).toEqual(sharedB)
    expect(exclusiveA).not.toBeNull()

    await expect(
      sweepCopyrightEvidenceRetention({ now: afterRetention(), noticeIds: [erasedCase.noticeId] }),
    ).resolves.toEqual({ erased: 1, ineligible: 0, failed: [] })
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
