import { afterEach, describe, expect, it, vi } from 'vitest'
import { interceptCopyrightImpositionForTest } from '@voucha/test-helpers/copyright-imposition-intercept'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestTerritorialRestrictionScene,
  readTestTerritorialDecisions,
} from '@voucha/test-helpers/copyright-territorial-restriction-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { readTestOwnedCopyrightSweepIds } from '@voucha/test-helpers/services/copyright-notices/sweep-ids'
import {
  recordEuCopyrightRedressDecision,
  recordUkCopyrightRedressDecision,
  submitEuCopyrightRedress,
  submitUkCopyrightRedress,
  enforceCopyrightAssessment,
  recordEuCopyrightStatementOfReasons,
  recordUkCopyrightReview,
  searchPendingCopyrightEnforcementAssessmentIds,
} from './index.mts'

const determine = {
  eu_dsa: recordEuCopyrightStatementOfReasons,
  uk: recordUkCopyrightReview,
}
const jurisdictions = ['eu_dsa', 'uk'] as const
const submit = { eu_dsa: submitEuCopyrightRedress, uk: submitUkCopyrightRedress }
const decideComplaint = {
  eu_dsa: recordEuCopyrightRedressDecision,
  uk: recordUkCopyrightRedressDecision,
}

function restrictionInput(
  targets: Awaited<ReturnType<typeof createTestTerritorialRestrictionScene>>['targets'],
) {
  return {
    text: 'The hosted image reproduces the work identified by the claimant.',
    publicExplanation: 'The listed post image reproduces the claimant’s protected photograph.',
    outcome: 'restrict' as const,
    targets,
  }
}

describe('territorial restriction commitment and enforcement', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each(jurisdictions)(
    '%s keeps a failed post-commit enforcement owed for the sweep',
    async jurisdiction => {
      const scene = await createTestTerritorialRestrictionScene(jurisdiction)
      interceptCopyrightImpositionForTest(scene.noticeId, async () => {
        throw new Error('temporary enforcement interruption')
      })
      await expect(
        determine[jurisdiction](scene.staff, scene.noticeId, restrictionInput(scene.targets)),
      ).rejects.toThrow('temporary enforcement interruption')
      const decisions = await readTestTerritorialDecisions(scene.noticeId)
      expect(decisions).toHaveLength(1)
      const assessmentId = decisions[0]?.copyright_notice_submission_assessment_identity_id
      if (!assessmentId) throw new Error('Decision assessment was not committed')
      expect((await getCopyrightNoticePrivateAggregate(scene.noticeId))?.targets).toHaveLength(1)
      expect((await getCopyrightNoticePrivateAggregate(scene.noticeId))?.restrictions).toHaveLength(
        0,
      )
      await expect(
        readTestOwnedCopyrightSweepIds(
          searchPendingCopyrightEnforcementAssessmentIds,
          assessmentId,
        ),
      ).resolves.toEqual([assessmentId])
      await enforceCopyrightAssessment(assessmentId)
      expect((await getCopyrightNoticePrivateAggregate(scene.noticeId))?.restrictions).toHaveLength(
        1,
      )
      await expect(
        readTestOwnedCopyrightSweepIds(
          searchPendingCopyrightEnforcementAssessmentIds,
          assessmentId,
        ),
      ).resolves.toEqual([])
    },
  )

  it.each(jurisdictions)(
    '%s rolls back every decision fact for an unknown image',
    async jurisdiction => {
      const scene = await createTestTerritorialRestrictionScene(jurisdiction)
      const invalid = { ...scene.targets[0]!, imageId: crypto.randomUUID() }
      await expect(
        determine[jurisdiction](scene.staff, scene.noticeId, restrictionInput([invalid])),
      ).rejects.toMatchObject({ status: 422 })
      expect(await readTestTerritorialDecisions(scene.noticeId)).toEqual([])
      const aggregate = await getCopyrightNoticePrivateAggregate(scene.noticeId)
      expect(aggregate?.targets).toEqual([])
      expect(aggregate?.submissions).toEqual([])
      expect(aggregate?.assessments).toEqual([])
      expect(aggregate?.restrictions).toEqual([])
    },
  )

  it.each(jurisdictions)('%s serializes two staff decisions on one receipt', async jurisdiction => {
    const scene = await createTestTerritorialRestrictionScene(jurisdiction)
    const staffRequest = createRequest()
    await staffRequest.authenticateAs(scene.staff)
    const url =
      jurisdiction === 'eu_dsa'
        ? `/api/v1/copyright-eu-notices/${scene.noticeId}/statements-of-reasons`
        : `/api/v1/copyright-uk-notices/${scene.noticeId}/reviews`
    const body = {
      [jurisdiction === 'eu_dsa' ? 'statement' : 'rationale']:
        'The hosted image reproduces the work identified by the claimant.',
      public_explanation: 'The listed post image reproduces the protected photograph.',
      outcome: 'restrict',
      targets: scene.targets.map(target => ({
        surface: 'post-image',
        post_id: target.postId,
        image_id: target.imageId,
        target_url: target.hostedUseUrl,
      })),
    }
    const responses = await Promise.all([
      staffRequest.post(url).send(body),
      staffRequest.post(url).send(body),
    ])
    expect(
      responses
        .map(response => response.status)
        .toSorted((a, b) => Number(String(a) > String(b)) - Number(String(a) < String(b))),
    ).toEqual([201, 409])
    expect(await readTestTerritorialDecisions(scene.noticeId)).toHaveLength(1)
    expect((await getCopyrightNoticePrivateAggregate(scene.noticeId))?.restrictions).toHaveLength(1)
  })

  it.each(jurisdictions)(
    '%s never imposes a second owed target after revoking the first restriction',
    async jurisdiction => {
      const scene = await createTestTerritorialRestrictionScene(jurisdiction, 2)
      interceptCopyrightImpositionForTest(
        scene.noticeId,
        async () => {
          throw new Error('second target still owed')
        },
        2,
      )
      await expect(
        determine[jurisdiction](scene.staff, scene.noticeId, restrictionInput(scene.targets)),
      ).rejects.toThrow('second target still owed')
      const decision = (await readTestTerritorialDecisions(scene.noticeId))[0]
      const assessmentId = decision?.copyright_notice_submission_assessment_identity_id
      if (!assessmentId) throw new Error('Decision assessment was not committed')
      const before = await getCopyrightNoticePrivateAggregate(scene.noticeId)
      expect(before?.targets).toHaveLength(2)
      expect(before?.restrictions).toHaveLength(1)
      const redress = await submit[jurisdiction](
        scene.claimant,
        scene.noticeId,
        crypto.randomUUID(),
        'The restriction was mistaken.',
      )
      await decideComplaint[jurisdiction](scene.staff, scene.noticeId, redress.id, {
        disposition: 'revoke',
        rationale: 'The complaint shows the restriction was mistaken.',
      })
      await enforceCopyrightAssessment(assessmentId)
      expect((await getCopyrightNoticePrivateAggregate(scene.noticeId))?.restrictions).toHaveLength(
        1,
      )
      await expect(
        readTestOwnedCopyrightSweepIds(
          searchPendingCopyrightEnforcementAssessmentIds,
          assessmentId,
        ),
      ).resolves.toEqual([])
    },
  )
})
