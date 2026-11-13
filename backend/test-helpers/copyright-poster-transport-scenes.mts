import { createTestUser } from './index.mts'
import { createCommittedCopyrightStatementScene } from './copyright-statement-scene.mts'
import { seedEffectiveConfirmation } from './copyright-effective-review-decisions.mts'
import {
  readTestCopyrightStatementIntents,
  createTestCopyrightLiftStatement,
} from './copyright-statement-notices.mts'
import { seedStatementTransportSent } from './copyright-statement-transport-fixtures.mts'

export async function createPosterReviewTransportScene() {
  const poster = await createTestUser()
  const scene = await createCommittedCopyrightStatementScene({ poster }, { automated: true })
  const noticeId = scene.notice.intake.copyright_notice_id
  const restriction = scene.restriction!
  await seedEffectiveConfirmation(noticeId, restriction.id, scene.moderator, 'reverse')
  await createTestCopyrightLiftStatement({
    noticeId,
    restrictionId: restriction.id,
    targetId: restriction.copyright_notice_target_id,
  })
  const intents = (await readTestCopyrightStatementIntents(noticeId)).filter(
    row => row.delivery_kind !== 'poster_restriction_notice',
  )
  return { ...scene, poster, noticeId, intents }
}

export async function createDeliveredPosterTransportScene(review = false) {
  const poster = await createTestUser()
  const scene = review
    ? await createPosterReviewTransportScene()
    : { ...(await createCommittedCopyrightStatementScene({ poster })), poster }
  const noticeId = scene.notice.intake.copyright_notice_id
  const intents = (await readTestCopyrightStatementIntents(noticeId)).filter(row =>
    review ? row.delivery_kind !== 'poster_restriction_notice' : row.recipient_role === 'poster',
  )
  for (const intent of intents) await seedStatementTransportSent(intent.id)
  return { ...scene, noticeId, intents: await readTestCopyrightStatementIntents(noticeId) }
}
