import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import type { PrivateUser } from '../services/users/types.mts'
import { receiveEuCopyrightNotice } from '../services/copyright-notices/eu-notice-receipt.mts'
import { seedCommittedTerritorialAcknowledgment } from './copyright-territorial-acknowledged-fixture.mts'
import { seedCommittedTerritorialDecision } from './copyright-territorial-committed-decision.mts'
import {
  seedCommittedTerritorialRedress,
  seedCommittedTerritorialRedressDecision,
} from './copyright-territorial-committed-redress.mts'
import type { createHostedImagePost } from './services/copyright-notices/hosted-post-audience.mts'

export function noticeRequest() {
  const suffix = crypto.randomUUID()
  return {
    contact: `claimant-${suffix}@example.test`,
    contentDescription: `Work ${suffix}`,
    grounds: `Grounds ${suffix}`,
    hostedUseUrl: `https://example.test/${suffix}`,
  }
}

export function euNoticeRequest() {
  const base = noticeRequest()
  return {
    ...base,
    notifierName: 'Notice claimant',
    notifierEmail: base.contact,
    goodFaithStatement: true as const,
  }
}

export function target(post: Awaited<ReturnType<typeof createHostedImagePost>>) {
  return {
    surfaceKind: 'post-image' as const,
    postId: post.postId,
    imageId: post.imageId,
    hostedUseUrl: `https://example.test/${post.postId}`,
  }
}

/** Independent committed decision facts keep later continuity assertions unconditional. */
export async function createWithdrawalContinuation(claimant: PrivateUser, staff: PrivateUser) {
  const euContinuation = await receiveEuCopyrightNotice(
    { user: claimant, identity: `user:${claimant.id}` },
    crypto.randomUUID(),
    euNoticeRequest(),
  )
  await seedCommittedTerritorialAcknowledgment('eu_dsa', euContinuation.notice_id)
  await seedCommittedTerritorialDecision('eu_dsa', staff, euContinuation.notice_id, {
    text: 'The supplied evidence does not identify infringement.',
    publicExplanation: 'The notice did not establish that this image infringes.',
    outcome: 'no_action',
    targets: [],
  })
  const continuationComplaint = await seedCommittedTerritorialRedress(
    'eu_dsa',
    euContinuation.notice_id,
    claimant,
    'Please reconsider the no-action decision.',
  )
  return { euContinuation, continuationComplaint }
}
export async function completeWithdrawalContinuation(
  staff: PrivateUser,
  noticeId: string,
  redressId: string,
  post: Awaited<ReturnType<typeof createHostedImagePost>>,
) {
  await seedCommittedTerritorialRedressDecision('eu_dsa', noticeId, redressId, staff, {
    disposition: 'revoke',
    rationale: 'The no-action decision was unfounded.',
  })
  await seedCommittedTerritorialDecision('eu_dsa', staff, noticeId, {
    text: 'On renewed review the notice identifies infringement.',
    publicExplanation: 'The image reproduces the claimant’s work.',
    outcome: 'restrict',
    targets: [target(post)],
  })
}

export async function actionIntent(noticeId: string, action: 'withhold' | 'restore') {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const intent = aggregate?.actionIntents.find(row => row.action === action)
  if (!intent) throw new Error(`Missing ${action} intent for ${noticeId}`)
  return intent
}
