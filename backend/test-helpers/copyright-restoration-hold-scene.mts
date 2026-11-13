import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { appendTestCopyrightNoticeSubmission } from './copyright-notice-submissions.mts'
import { appendCopyrightLegalHoldAssessment } from '../services/copyright-notices/index.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'
import {
  createCopyrightRestorationHoldFixture,
  createCounterNoticeRestoreIntent,
  deliverInitialCopyrightWithhold,
} from './copyright-restoration-hold-fixtures.mts'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

/** With `shared`, the notice restricts a placement another scene already withheld. */
export async function openHeldCounterNoticeRestore(
  targetCount = 1,
  shared?: Parameters<typeof createCopyrightRestorationHoldFixture>[1],
) {
  const { aggregate, assessment, claimant, moderator, notice } =
    await createCopyrightRestorationHoldFixture(targetCount, shared)
  const target = aggregate.targets[0]!
  const restriction = await seedCopyrightStatementRestriction({
    noticeId: notice.id,
    targetId: target.id,
    assessmentId: assessment.id,
    imposedAt: new Date('2026-07-01T12:00:00.000Z'),
    moderatorId: moderator.id,
    revision: target.placement_revision,
  })
  const initialWithhold = (await getCopyrightNoticePrivateAggregate(notice.id))?.actionIntents.find(
    intent => intent.action === 'withhold',
  )
  if (!initialWithhold) throw new Error('initial withhold intent disappeared')
  if (!shared) await deliverInitialCopyrightWithhold(notice.id)
  for (const other of aggregate.targets.slice(1)) {
    await seedCopyrightStatementRestriction({
      noticeId: notice.id,
      targetId: other.id,
      assessmentId: assessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      moderatorId: moderator.id,
      revision: other.placement_revision,
    })
  }
  const opened = await createCounterNoticeRestoreIntent({
    claimant,
    noticeId: notice.id,
    moderator,
    targetId: target.id,
    restrictionId: restriction.id,
    placementRevision: target.placement_revision,
  })
  return {
    claimant,
    moderator,
    notice,
    target,
    restriction,
    initialWithhold,
    restorationAt: opened.now,
    restore: opened.restore,
  }
}

export async function recordOrdinaryCopyrightHold(
  scene: Awaited<ReturnType<typeof openHeldCounterNoticeRestore>>,
  targetIds: string[] = [scene.target.id],
) {
  const receivedAt = new Date('2026-07-03T12:00:00.000Z')
  const submission = await appendTestCopyrightNoticeSubmission({
    noticeId: scene.notice.id,
    kind: 'court_or_ccb_hold',
    receivedAt,
    sourceKind: 'email',
    submittedByUserId: null,
    bodyCiphertext: `hold-${crypto.randomUUID()}`,
  })
  return appendCopyrightLegalHoldAssessment({
    currentUser: scene.moderator,
    submissionId: submission.id,
    assessedAt: receivedAt,
    fromOriginalClaimant: true,
    proceedingKind: 'federal_court',
    ccbClaimKind: null,
    commencedAt: new Date('2026-07-03T11:00:00.000Z'),
    receivedByDesignatedAgentAt: receivedAt,
    sameMaterial: true,
    targetIds,
    rationale: 'Verified original claimant proceeding on this target.',
  })
}

/** Every durable late-hold binding in one owned case. */
export async function readCopyrightLateHoldBindings(noticeId: string) {
  const { rows } = await read<{
    assessment_id: string
    restriction_id: string
  }>(sql`/* readCopyrightLateHoldBindings */
    SELECT binding.copyright_notice_legal_hold_assessment_id AS assessment_id,
      binding.copyright_restriction_id AS restriction_id
    FROM copyright_legal_hold_restrictions binding
    JOIN copyright_restrictions restriction ON restriction.id = binding.copyright_restriction_id
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE target.copyright_notice_id = ${noticeId}`)
  return rows
}
