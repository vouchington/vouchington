import { describe, expect, it } from 'vitest'
import { readCopyrightAssessmentPointers } from '@voucha/test-helpers/copyright-form-review-assessment-race'
import { readCopyrightThreadRetirementBound } from '@voucha/test-helpers/copyright-thread-retention'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import {
  readCopyrightEmailManualAssociationEvent,
  readCopyrightEmailManualAssociationReview,
} from '@voucha/test-helpers/copyright-email-manual-association'
import { holdCopyrightCaseBeforeThreadEligibility } from '@voucha/test-helpers/copyright-thread-sweep-admission-race'
import { createCopyrightThreadMarkerScene } from '@voucha/test-helpers/copyright-thread-preservation-fixture'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import {
  seedCopyrightThreadRetirement,
  readCopyrightThreadReferenceState,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import {
  assessAfterMixedCopyrightRetirementRead,
  afterCopyrightThreadRetirementRead,
} from '@voucha/test-helpers/copyright-preservation-coverage-interleave'
import { associateCopyrightEmailIntakeWithNotice } from './email-manual-association.mts'
import { sweepCopyrightCaseThreads } from './operational-retention-threading.mts'

const day = 24 * 60 * 60 * 1000

describe('thread evidence admission and retirement commit order', () => {
  const options = () => ({
    now: new Date(Date.now() + 181 * day),
    replyDays: 180,
    batchSize: 10,
    maxBatches: 100,
  })
  it('keeps the admitted evidence when its writer commits before the retirement marker', async () => {
    const { notice, reply, candidate, scope } = await createCopyrightThreadMarkerScene()
    const before = await readCopyrightThreadReferenceState(reply.id)
    const failures: unknown[] = []
    let admitted: unknown
    const result = await holdCopyrightCaseBeforeThreadEligibility(
      notice.noticeId,
      async () => {
        admitted = await associateCopyrightEmailIntakeWithNotice(
          notice.moderator,
          candidate.id,
          notice.noticeId,
        )
          .then(value => ({ status: 'fulfilled', value }))
          .catch((err: unknown) => ({ status: 'rejected', reason: err }))
      },
      () => sweepCopyrightCaseThreads({ ...options(), scope }),
      err => failures.push(err),
    )
    const native = expect.objectContaining({ code: '40001' })
    const conflict = expect.objectContaining({
      status: 'rejected',
      reason: expect.objectContaining({
        status: 409,
        code: 'copyright_email_thread_changed',
        cause: native,
      }),
    })
    const success = {
      status: 'fulfilled',
      value: {
        copyright_notice: { id: notice.noticeId },
        copyright_email_intake: { id: candidate.id },
      },
    }
    const added = {
      links: [{ copyright_notice_id: notice.noticeId, link_kind: 'thread' }],
      reviews: [{ copyright_notice_id: notice.noticeId, action: 'pending' }],
      audits: [
        {
          copyright_notice_id: notice.noticeId,
          changed_by_id: notice.moderator.id,
          copyright_notice_email_intake_id: candidate.id,
        },
      ],
    }
    expect([
      { admitted: success, deleted: false, references: before, failures: [native], ...added },
      { admitted: success, deleted: false, references: before, failures: [], ...added },
      {
        admitted: conflict,
        deleted: false,
        references: before,
        failures: [native],
        links: [],
        reviews: [],
        audits: [],
      },
      {
        admitted: conflict,
        deleted: true,
        references: { tokenId: null, referenceCount: 0 },
        failures: [],
        links: [],
        reviews: [],
        audits: [],
      },
    ]).toContainEqual({
      admitted,
      deleted: result.deleted > 0,
      references: await readCopyrightThreadReferenceState(reply.id),
      failures,
      links: await readCopyrightEmailIntakeNoticeLinks(candidate.id),
      reviews: await readCopyrightEmailManualAssociationReview(candidate.id),
      audits: await readCopyrightEmailManualAssociationEvent(candidate.id),
    })
  })
  it('preserves the full writer or retirement result when their marker reads overlap', async () => {
    const { notice, reply, candidate, scope } = await createCopyrightThreadMarkerScene()
    const before = await readCopyrightThreadReferenceState(reply.id)
    let retired: boolean | null = null
    const writer = await afterCopyrightThreadRetirementRead(
      notice.noticeId,
      async () => {
        retired = (await sweepCopyrightCaseThreads({ ...options(), scope })).deleted > 0
      },
      () =>
        associateCopyrightEmailIntakeWithNotice(notice.moderator, candidate.id, notice.noticeId),
    )
      .then(value => ({ status: 'fulfilled', value }))
      .catch((err: unknown) => ({ status: 'rejected', reason: err }))
    const conflict = expect.objectContaining({
      status: 'rejected',
      reason: expect.objectContaining({
        status: 409,
        code: 'copyright_email_thread_changed',
        cause: expect.objectContaining({ code: '40001' }),
      }),
    })
    const success = {
      status: 'fulfilled',
      value: {
        copyright_notice: { id: notice.noticeId },
        copyright_email_intake: { id: candidate.id },
      },
    }
    const empty = { links: [], reviews: [], audits: [] }
    expect([
      {
        writer: conflict,
        retired: true,
        references: { tokenId: null, referenceCount: 0 },
        marker: true,
        ...empty,
      },
      { writer: conflict, retired: false, references: before, marker: false, ...empty },
      { writer: conflict, retired: null, references: before, marker: false, ...empty },
      {
        writer: success,
        retired: false,
        references: before,
        marker: false,
        links: [{ copyright_notice_id: notice.noticeId, link_kind: 'thread' }],
        reviews: [{ copyright_notice_id: notice.noticeId, action: 'pending' }],
        audits: [
          {
            copyright_notice_id: notice.noticeId,
            changed_by_id: notice.moderator.id,
            copyright_notice_email_intake_id: candidate.id,
          },
        ],
      },
    ]).toContainEqual({
      writer,
      retired,
      references: await readCopyrightThreadReferenceState(reply.id),
      marker: (await readCopyrightThreadRetirementBound(notice.noticeId)) !== null,
      links: await readCopyrightEmailIntakeNoticeLinks(candidate.id),
      reviews: await readCopyrightEmailManualAssociationReview(candidate.id),
      audits: await readCopyrightEmailManualAssociationEvent(candidate.id),
    })
  })
  it('rejects fresh association after a committed retirement without changing graph or audit', async () => {
    const { notice, reply, candidate } = await createCopyrightThreadMarkerScene()
    await seedCopyrightThreadRetirement(notice.noticeId, candidate.id)
    const before = await readCopyrightThreadReferenceState(reply.id)
    await expect(
      associateCopyrightEmailIntakeWithNotice(notice.moderator, candidate.id, notice.noticeId),
    ).rejects.toMatchObject({
      status: 409,
      code: 'copyright_email_thread_changed',
      message: 'Copyright case email threading has been retired',
    })
    expect(await readCopyrightThreadReferenceState(reply.id)).toEqual(before)
    expect(await readCopyrightEmailIntakeNoticeLinks(candidate.id)).toEqual([])
    expect(await readCopyrightEmailManualAssociationReview(candidate.id)).toEqual([])
    expect(await readCopyrightEmailManualAssociationEvent(candidate.id)).toEqual([])
  })
  it('retains the complete mixed-marker cohort dependency in either valid commit result', async () => {
    const retired = await createRetentionMinimalCase()
    await seedCopyrightThreadRetirement(retired.noticeId, retired.noticeId)
    const { notice, reply, scope } = await createCopyrightThreadMarkerScene()
    const before = await readCopyrightThreadReferenceState(reply.id)
    let swept: boolean | null = null
    const assessment = await assessAfterMixedCopyrightRetirementRead(
      [retired.noticeId, notice.noticeId],
      notice.submissionId,
      notice.moderator,
      async () => {
        swept = (await sweepCopyrightCaseThreads({ ...options(), scope })).deleted > 0
      },
    )
      .then(value => ({ status: 'fulfilled', value }))
      .catch((err: unknown) => ({ status: 'rejected', reason: err }))
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.noticeId)
    const id = aggregate?.assessments[0]?.id ?? null
    const abort = expect.objectContaining({
      status: 'rejected',
      reason: expect.objectContaining({ code: '40001' }),
    })
    const success = expect.objectContaining({
      status: 'fulfilled',
      value: expect.objectContaining({
        id,
        copyright_notice_submission_id: notice.submissionId,
        assessed_by_id: notice.moderator.id,
        is_substantially_compliant: true,
      }),
    })
    const empty = { assessments: [], events: [], pointer: null }
    expect([
      {
        assessment: abort,
        swept: true,
        references: { tokenId: null, referenceCount: 0 },
        marker: true,
        ...empty,
      },
      { assessment: abort, swept: false, references: before, marker: false, ...empty },
      { assessment: abort, swept: null, references: before, marker: false, ...empty },
      {
        assessment: success,
        swept: false,
        references: before,
        marker: false,
        assessments: [id],
        events: [id],
        pointer: id,
      },
    ]).toContainEqual({
      assessment,
      swept,
      references: await readCopyrightThreadReferenceState(reply.id),
      marker: (await readCopyrightThreadRetirementBound(notice.noticeId)) !== null,
      assessments: aggregate?.assessments.map(row => row.id),
      events: aggregate?.lifecycleEvents
        .filter(row => row.change_type === 'submission_assessed')
        .map(row => row.copyright_notice_submission_assessment_identity_id),
      pointer: (await readCopyrightAssessmentPointers(notice.noticeId)).find(
        row => row.id === notice.submissionId,
      )?.current_assessment_identity_id,
    })
    expect(await readCopyrightThreadRetirementBound(retired.noticeId)).toBe(retired.noticeId)
  })
})
