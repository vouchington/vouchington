import { createTestSubmissionGuidanceCounterCase } from './copyright-submission-guidance-disclosure-fixtures.mts'
import { seedRestorationCounterNotice } from './copyright-restoration-counter-notice-fixture.mts'
import { seedDisclosureCounterReview } from './copyright-disclosure-review-fixtures.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { seedStatementTransportSent } from './copyright-statement-transport-fixtures.mts'

/** Independent completed receipt/decision transport always reaches the real notification consumer. */
export async function createCommittedDisclosureInAppScene(
  kind: 'receipt' | 'decision' | 'late',
  addGuidance: (submissionId: string) => Promise<void>,
) {
  const scene = await createTestSubmissionGuidanceCounterCase()
  const counter = await seedRestorationCounterNotice(scene.poster, scene.noticeId, [
    scene.target.id,
  ])
  if (kind !== 'late') await addGuidance(counter.submission.id)
  if (kind !== 'receipt')
    await seedDisclosureCounterReview({
      submissionId: counter.submission.id,
      currentUser: scene.moderator,
      is_accepted: false,
      rationale: 'The declarations need review.',
    })
  if (kind === 'late') await addGuidance(counter.submission.id)
  const aggregate = (await getCopyrightNoticePrivateAggregate(scene.noticeId))!
  const matching = aggregate.deliveryIntents.filter(
    row =>
      row.copyright_notice_submission_id === counter.submission.id &&
      row.delivery_kind === 'status_update' &&
      row.channel === 'in_app',
  )
  const intent = kind === 'receipt' ? matching[0] : matching.at(-1)
  if (!intent) throw new Error('Owned disclosure notification disappeared')
  await seedStatementTransportSent(intent.id)
  return { ...scene, intent }
}
