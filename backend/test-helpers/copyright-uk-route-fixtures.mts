import type { PrivateUser } from '../services/users/types.mts'
import { receiveUkCopyrightNotice } from '../services/copyright-notices/uk-notice-receipt.mts'
import { seedCommittedTerritorialAcknowledgment } from './copyright-territorial-acknowledged-fixture.mts'
import { seedCommittedTerritorialDecision } from './copyright-territorial-committed-decision.mts'
import { seedCommittedTerritorialRedress } from './copyright-territorial-committed-redress.mts'
import { readCopyrightApiTerritorialState } from './copyright-api-territorial-request-outcomes.mts'

/** Independent committed prerequisites keep later route/privacy checks executable after any abort. */
export async function createUkRouteAcknowledgedCase(claimant: PrivateUser) {
  const receipt = await receiveUkCopyrightNotice(
    { user: claimant, identity: `user:${claimant.id}` },
    crypto.randomUUID(),
    {
      contact: `claimant-${crypto.randomUUID()}@example.test`,
      contentDescription: 'Committed route work',
      grounds: 'Committed route grounds',
      hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
    },
  )
  await seedCommittedTerritorialAcknowledgment('uk', receipt.notice_id)
  return receipt.notice_id
}

export async function createUkRouteDecidedCase(claimant: PrivateUser, staff: PrivateUser) {
  const noticeId = await createUkRouteAcknowledgedCase(claimant)
  await seedCommittedTerritorialDecision('uk', staff, noticeId, {
    text: 'Second staff review',
    publicExplanation: 'The notice did not establish infringement.',
    outcome: 'no_action',
    targets: [],
  })
  return noticeId
}

export async function createUkRouteRedressCase(claimant: PrivateUser, staff: PrivateUser) {
  const noticeId = await createUkRouteDecidedCase(claimant, staff)
  const redress = await seedCommittedTerritorialRedress(
    'uk',
    noticeId,
    staff,
    'Please review this notice',
    'reviewer',
  )
  const state = await readCopyrightApiTerritorialState(noticeId)
  const row = state.requests.find(request => request.id === redress.id)
  if (!row) throw new Error('Owned route redress disappeared')
  return { noticeId, redressId: redress.id, key: row.idempotency_key }
}
