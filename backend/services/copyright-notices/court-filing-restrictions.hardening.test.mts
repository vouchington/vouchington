import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCopyrightCourtFilingScene } from '@voucha/test-helpers/copyright-court-filing-scene'
import { mediaDeliveryEdgeEnvironment } from '@voucha/test-helpers/media-delivery-emulator'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  insertTestCopyrightFilingSource,
  changeTestCopyrightFilingSource,
} from '@voucha/test-helpers/copyright-filing-source-constraints'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'
import { completeCopyrightMandatoryHumanReview } from './human-review.mts'

describe('canonical filing restriction source contract', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it('rejects missing/both sources, noncourt source, cross-case source, and automated-assessment fiction', async () => {
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const scene = await createCopyrightCourtFilingScene()
    const other = await createCopyrightCourtFilingScene()
    const filing = await scene.file()
    const aggregate = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    const noticeSubmission = aggregate?.submissions.find(row => row.kind === 'notice')
    if (!noticeSubmission) throw new Error('Notice submission disappeared')
    const assessment = await appendCopyrightSubmissionAssessment({
      currentUser: scene.moderator,
      submissionId: noticeSubmission.id,
      assessedAt: new Date(),
      substantiallyCompliant: true,
    })
    await expect(
      insertTestCopyrightFilingSource({
        targetId: scene.target.id,
        submissionId: null,
        assessmentId: null,
      }),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      insertTestCopyrightFilingSource({
        targetId: scene.target.id,
        submissionId: filing.id,
        assessmentId: assessment.id,
      }),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      insertTestCopyrightFilingSource({
        targetId: scene.target.id,
        submissionId: noticeSubmission.id,
        assessmentId: null,
      }),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      insertTestCopyrightFilingSource({
        targetId: other.target.id,
        submissionId: filing.id,
        assessmentId: null,
      }),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      insertTestCopyrightFilingSource({
        targetId: scene.target.id,
        submissionId: filing.id,
        assessmentId: null,
        automated: true,
      }),
    ).rejects.toMatchObject({ code: '23514' })
  })
  it('keeps filing provenance immutable and denies ordinary assessment-review actions', async () => {
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const scene = await createCopyrightCourtFilingScene()
    const first = await scene.file()
    const second = await scene.file()
    const aggregate = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    const restriction = aggregate?.restrictions.find(
      row => row.copyright_notice_submission_id === first.id,
    )
    if (!restriction) throw new Error('Filing restriction disappeared')
    await expect(changeTestCopyrightFilingSource(restriction.id, second.id)).rejects.toMatchObject({
      code: '23514',
    })
    await expect(
      completeCopyrightMandatoryHumanReview({
        currentUser: scene.moderator,
        noticeId: scene.notice.id,
        restrictionId: restriction.id,
        action: 'confirm',
        rationale: 'This is not a notice compliance assessment.',
        reviewedAt: new Date(),
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(
      (await getCopyrightNoticePrivateAggregate(scene.notice.id))?.restrictions.find(
        row => row.id === restriction.id,
      ),
    ).toMatchObject({
      copyright_notice_submission_id: first.id,
      authorizing_assessment_id: null,
      human_reviewed_at: null,
    })
  })
})
