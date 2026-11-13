import { seedCommittedTerritorialAcknowledgment } from './copyright-territorial-acknowledged-fixture.mts'
import { seedCommittedTerritorialDecision } from './copyright-territorial-committed-decision.mts'
import { createTestUser } from './entities/users.mts'
import {
  createCopyrightGuestIdentity,
  receiveEuCopyrightNotice,
  recordCopyrightJurisdictionPolicyApproval,
} from '../services/copyright-notices/index.mts'

export async function createTestGuestEuCase(state: 'pending' | 'decided' = 'decided') {
  const [staff, administrator] = await Promise.all([
    createTestUser({ extraRoles: ['moderator'] }),
    createTestUser({ administrator: true }),
  ])
  const suffix = crypto.randomUUID()
  await recordCopyrightJurisdictionPolicyApproval(administrator, {
    jurisdiction: 'eu_dsa',
    policyVersion: `eu-${suffix.replaceAll('-', '').slice(0, 12)}`,
  })
  const email = `guest-${suffix}@example.test`
  const receipt = await receiveEuCopyrightNotice(
    { user: null, identity: createCopyrightGuestIdentity(`guest-${suffix}`) },
    crypto.randomUUID(),
    {
      notifierName: `Guest ${suffix}`,
      notifierEmail: email,
      goodFaithStatement: true,
      contact: `Guest contact ${suffix}`,
      contentDescription: `Work ${suffix}`,
      grounds: `Grounds ${suffix}`,
      hostedUseUrl: `https://example.test/work/${suffix}`,
    },
  )
  if (state === 'decided') {
    await seedCommittedTerritorialAcknowledgment('eu_dsa', receipt.notice_id)
    await seedCommittedTerritorialDecision('eu_dsa', staff, receipt.notice_id, {
      text: `Decision ${suffix}`,
      publicExplanation: `Public explanation ${suffix}`,
      outcome: 'no_action',
      targets: [],
    })
  }
  return { staff, administrator, receipt, noticeId: receipt.notice_id, email, suffix }
}
