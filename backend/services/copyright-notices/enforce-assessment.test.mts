import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertLeadingQueryAnnotation } from '@vouchington/postgres'
import { countCopyrightActiveRestrictionsForNotice } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { readTestOwnedCopyrightSweepIds } from '@voucha/test-helpers/services/copyright-notices/sweep-ids'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'
import { searchPendingCopyrightEnforcementAssessmentIds } from './index.mts'
import { seedCopyrightSubmissionAssessment } from '@voucha/test-helpers/copyright-notice-submissions'
import { createCopyrightRestorationHoldFixture } from '@voucha/test-helpers/copyright-restoration-hold-fixtures'
import { seedCopyrightStatementRestriction } from '@voucha/test-helpers/copyright-statement-restriction-fixture'
import {
  assertAssessmentEnforcement,
  assertAssessmentEnforcementNoop,
} from '@voucha/test-helpers/copyright-assessment-enforcement-subjects'
import { assertEnforcementSupersession } from '@voucha/test-helpers/copyright-assessment-supersession-subject'

describe('copyright assessment enforcement', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('imposes nothing for an assessment that was rejected before enforcement runs', async () => {
    const scene = await createCopyrightRestorationHoldFixture()
    const { assessment, moderator, notice } = scene
    const submission = scene.aggregate.submissions[0]!
    await seedCopyrightSubmissionAssessment({
      submissionId: submission.id,
      assessedAt: new Date('2026-07-01T12:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: false,
      supersedesAssessmentId: assessment.id,
    })

    await assertAssessmentEnforcementNoop(scene)
    await expect(countCopyrightActiveRestrictionsForNotice(notice.id)).resolves.toBe(0)
  })

  it('settles stale authority discovered while a target is being imposed', async () => {
    expect.hasAssertions()
    await assertEnforcementSupersession(await createCopyrightRestorationHoldFixture())
  })

  it('imposes an unchanged compliant assessment in one complete job invocation', async () => {
    expect.hasAssertions()
    await assertAssessmentEnforcement(await createCopyrightRestorationHoldFixture())
  })

  it('replays an independently committed imposition without duplicating effects', async () => {
    const scene = await createCopyrightRestorationHoldFixture()
    const target = scene.aggregate.targets[0]!
    await seedCopyrightStatementRestriction({
      noticeId: scene.notice.id,
      targetId: target.id,
      assessmentId: scene.assessment.id,
      revision: target.placement_revision,
      moderatorId: scene.moderator.id,
    })
    await assertAssessmentEnforcementNoop(scene)
    await expect(countCopyrightActiveRestrictionsForNotice(scene.notice.id)).resolves.toBe(1)
  })

  it('leaves a committed assessment owing its target until the sweep enforcement commit', async () => {
    const scene = await createCopyrightRestorationHoldFixture()
    await expect(
      readTestOwnedCopyrightSweepIds(
        searchPendingCopyrightEnforcementAssessmentIds,
        scene.assessment.id,
      ),
    ).resolves.toEqual([scene.assessment.id])
    await expect(countCopyrightActiveRestrictionsForNotice(scene.notice.id)).resolves.toBe(0)
    await assertAssessmentEnforcement(scene)
  })

  it('annotates every statement while enforcing an owed assessment under the production contract', async () => {
    const scene = await createCopyrightRestorationHoldFixture()
    enableProductionAnnotationContract()
    const queries = await assertAssessmentEnforcement(scene)
    expect(queries.length).toBeGreaterThan(0)
    for (const { text } of queries) assertLeadingQueryAnnotation(text)
    expect(
      queries.some(({ text }) => text.startsWith('/* readFirstOwedCopyrightEnforcementTarget */')),
    ).toBe(true)
  })

  it('pages owned pending assessments under the production annotation contract', async () => {
    const { assessment } = await createCopyrightRestorationHoldFixture()
    enableProductionAnnotationContract()

    const { result, queries } = await withCapturedTestQueries(() =>
      readTestOwnedCopyrightSweepIds(searchPendingCopyrightEnforcementAssessmentIds, assessment.id),
    )

    expect(result).toEqual([assessment.id])
    expect(queries.length).toBeGreaterThan(0)
    for (const { text } of queries) assertLeadingQueryAnnotation(text)
    expect(
      queries.some(({ text }) =>
        text.startsWith('/* searchPendingCopyrightEnforcementAssessmentIds */'),
      ),
    ).toBe(true)
  })
})

function enableProductionAnnotationContract() {
  vi.stubEnv('NODE_ENV', 'development')
  vi.stubEnv('VITEST', 'false')
}
