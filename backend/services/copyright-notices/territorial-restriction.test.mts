import { seedCommittedTerritorialDecision } from '@voucha/test-helpers/copyright-territorial-committed-decision'
import {
  seedCommittedTerritorialRedress,
  seedCommittedTerritorialRedressDecision,
} from '@voucha/test-helpers/copyright-territorial-committed-redress'
import {
  assertTerritorialInterruptedDecision,
  assertTerritorialDecisionHttpRace,
} from '@voucha/test-helpers/copyright-territorial-decision-outcomes'
import { readTerritorialDecisionState } from '@voucha/test-helpers/copyright-territorial-decision-state'
import { assertTerritorialOwedEnforcement } from '@voucha/test-helpers/copyright-territorial-owed-enforcement'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { interceptCopyrightImpositionForTest } from '@voucha/test-helpers/copyright-imposition-intercept'
import {
  createTestTerritorialRestrictionScene,
  readTestTerritorialDecisions,
} from '@voucha/test-helpers/copyright-territorial-restriction-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { readTestOwnedCopyrightSweepIds } from '@voucha/test-helpers/services/copyright-notices/sweep-ids'
import {
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
      await assertTerritorialInterruptedDecision(
        jurisdiction,
        scene,
        restrictionInput(scene.targets),
        'temporary enforcement interruption',
        0,
      )
      // Owed enforcement runs from its own committed decision even if admission above aborted.
      const owed = await createTestTerritorialRestrictionScene(jurisdiction)
      await seedCommittedTerritorialDecision(
        jurisdiction,
        owed.staff,
        owed.noticeId,
        restrictionInput(owed.targets),
        0,
      )
      const decisions = await readTestTerritorialDecisions(owed.noticeId)
      expect(decisions).toHaveLength(1)
      const assessmentId = decisions[0]?.copyright_notice_submission_assessment_identity_id
      if (!assessmentId) throw new Error('Decision assessment was not committed')
      expect((await getCopyrightNoticePrivateAggregate(owed.noticeId))?.targets).toHaveLength(1)
      expect((await getCopyrightNoticePrivateAggregate(owed.noticeId))?.restrictions).toHaveLength(
        0,
      )
      await expect(
        readTestOwnedCopyrightSweepIds(
          searchPendingCopyrightEnforcementAssessmentIds,
          assessmentId,
        ),
      ).resolves.toEqual([assessmentId])
      await assertTerritorialOwedEnforcement(jurisdiction, owed)
      const completed = await createTestTerritorialRestrictionScene(jurisdiction)
      await seedCommittedTerritorialDecision(
        jurisdiction,
        completed.staff,
        completed.noticeId,
        restrictionInput(completed.targets),
      )
      const completedAssessment = (await readTestTerritorialDecisions(completed.noticeId))[0]!
        .copyright_notice_submission_assessment_identity_id
      if (!completedAssessment) throw new Error('Committed completed decision missing assessment')
      await expect(
        readTestOwnedCopyrightSweepIds(
          searchPendingCopyrightEnforcementAssessmentIds,
          completedAssessment,
        ),
      ).resolves.toEqual([])
    },
  )

  it.each(jurisdictions)(
    '%s rolls back every decision fact for an unknown image',
    async jurisdiction => {
      const scene = await createTestTerritorialRestrictionScene(jurisdiction)
      const fullBefore = await readTerritorialDecisionState(jurisdiction, scene)
      const invalid = { ...scene.targets[0]!, imageId: crypto.randomUUID() }
      await expect(
        determine[jurisdiction](scene.staff, scene.noticeId, restrictionInput([invalid])),
      ).rejects.toMatchObject({ status: 422, message: 'Hosted image placement was not found' })
      expect(await readTerritorialDecisionState(jurisdiction, scene)).toEqual(fullBefore)
      expect(await readTestTerritorialDecisions(scene.noticeId)).toEqual([])
      const aggregate = await getCopyrightNoticePrivateAggregate(scene.noticeId)
      expect(aggregate?.targets).toEqual([])
      expect(aggregate?.submissions).toEqual([])
      expect(aggregate?.assessments).toEqual([])
      expect(aggregate?.restrictions).toEqual([])
    },
  )

  it.each(jurisdictions)('%s serializes two staff decisions on one receipt', async jurisdiction => {
    expect.hasAssertions()
    const scene = await createTestTerritorialRestrictionScene(jurisdiction)
    await assertTerritorialDecisionHttpRace(jurisdiction, scene, restrictionInput(scene.targets))
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
      await assertTerritorialInterruptedDecision(
        jurisdiction,
        scene,
        restrictionInput(scene.targets),
        'second target still owed',
        1,
      )
      const committed = await createTestTerritorialRestrictionScene(jurisdiction, 2)
      await seedCommittedTerritorialDecision(
        jurisdiction,
        committed.staff,
        committed.noticeId,
        restrictionInput(committed.targets),
        1,
      )
      const decision = (await readTestTerritorialDecisions(committed.noticeId))[0]
      const assessmentId = decision?.copyright_notice_submission_assessment_identity_id
      if (!assessmentId) throw new Error('Decision assessment was not committed')
      const before = await getCopyrightNoticePrivateAggregate(committed.noticeId)
      expect(before?.targets).toHaveLength(2)
      expect(before?.restrictions).toHaveLength(1)
      const redress = await seedCommittedTerritorialRedress(
        jurisdiction,
        committed.noticeId,
        committed.claimant,
        'The restriction was mistaken.',
      )
      await seedCommittedTerritorialRedressDecision(
        jurisdiction,
        committed.noticeId,
        redress.id,
        committed.staff,
        {
          disposition: 'revoke',
          rationale: 'The complaint shows the restriction was mistaken.',
        },
      )
      const fullRevoked = await readTerritorialDecisionState(jurisdiction, committed)
      await enforceCopyrightAssessment(assessmentId)
      expect(await readTerritorialDecisionState(jurisdiction, committed)).toEqual(fullRevoked)
      expect(
        (await getCopyrightNoticePrivateAggregate(committed.noticeId))?.restrictions,
      ).toHaveLength(1)
      await expect(
        readTestOwnedCopyrightSweepIds(
          searchPendingCopyrightEnforcementAssessmentIds,
          assessmentId,
        ),
      ).resolves.toEqual([])
    },
  )
})
