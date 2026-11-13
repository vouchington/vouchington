import {
  listCopyrightGuestCapabilityEvents,
  readCopyrightGuestCapabilityState,
} from '@voucha/test-helpers/data-stores/psql/copyright-guest-lifecycle'
import {
  createWithdrawalCapabilityScene,
  seedCommittedGuestWithdrawal,
} from '@voucha/test-helpers/copyright-withdrawal-capability-fixture'
import { createWithdrawalEmailSource } from '@voucha/test-helpers/copyright-withdrawal-email-source'
import { seedCommittedEmailWithdrawal } from '@voucha/test-helpers/copyright-withdrawal-email-seed'
import {
  assertEmailWithdrawal,
  withdrawalEmailInput,
} from '@voucha/test-helpers/copyright-withdrawal-email-outcome'
import { assertGuestWithdrawalFiling } from '@voucha/test-helpers/copyright-withdrawal-guest-outcomes'
import { readWithdrawalState } from '@voucha/test-helpers/copyright-withdrawal-state'
import { describe, expect, it } from 'vitest'
import { appendCopyrightGuestFiling } from './index.mts'

describe('copyright guest capability revocation on withdrawal', () => {
  it('revokes every live token on the case when a guest files a withdrawal', async () => {
    const actor = await createWithdrawalCapabilityScene()
    await assertGuestWithdrawalFiling(actor, 'withdrawal')
    // Post-decision guards and the unrelated-case actor run even if the first subject loses SSI.
    const scene = await createWithdrawalCapabilityScene()
    const now = await seedCommittedGuestWithdrawal(scene)
    const before = await readWithdrawalState([scene.noticeId, scene.otherNoticeId])
    for (const capability of [scene.filer, scene.sibling]) {
      expect(await readCopyrightGuestCapabilityState(capability.id)).toEqual({
        issued_by_id: scene.staff.id,
        revoked_at: now,
      })
      expect(await listCopyrightGuestCapabilityEvents(capability.id)).toEqual([
        { change_type: 'guest_capability_issued', changed_by_id: scene.staff.id },
        { change_type: 'guest_capability_revoked_by_withdrawal', changed_by_id: null },
      ])
      await expect(
        appendCopyrightGuestFiling({
          noticeId: scene.noticeId,
          token: capability.token,
          now,
          kind: 'supplement',
          statement: `revoked-${crypto.randomUUID()}`,
        }),
      ).rejects.toMatchObject({
        status: 403,
        message: 'Copyright guest capability is not valid for this notice',
      })
    }
    expect((await readCopyrightGuestCapabilityState(scene.alreadyRevoked.id)).revoked_at).toEqual(
      scene.staffRevokedAt,
    )
    expect(await listCopyrightGuestCapabilityEvents(scene.alreadyRevoked.id)).toEqual([
      { change_type: 'guest_capability_issued', changed_by_id: scene.staff.id },
      { change_type: 'guest_capability_revoked', changed_by_id: scene.staff.id },
    ])
    expect(await readWithdrawalState([scene.noticeId, scene.otherNoticeId])).toEqual(before)
    await assertGuestWithdrawalFiling(scene, 'supplement')
  })

  it('revokes the case tokens when staff admit an emailed withdrawal', async () => {
    const actor = await createWithdrawalCapabilityScene()
    const actorEmail = await createWithdrawalEmailSource(actor.noticeId, 'claimant@example.test')
    await assertEmailWithdrawal(actor, actorEmail)
    const scene = await createWithdrawalCapabilityScene()
    const email = await createWithdrawalEmailSource(scene.noticeId, 'claimant@example.test')
    await seedCommittedEmailWithdrawal(withdrawalEmailInput(scene, email.id))
    expect((await readCopyrightGuestCapabilityState(scene.filer.id)).revoked_at).toEqual(
      expect.any(Date),
    )
    expect(await listCopyrightGuestCapabilityEvents(scene.filer.id)).toEqual([
      { change_type: 'guest_capability_issued', changed_by_id: scene.staff.id },
      { change_type: 'guest_capability_revoked_by_withdrawal', changed_by_id: null },
    ])
    const before = await readWithdrawalState([scene.noticeId, scene.otherNoticeId])
    await expect(
      appendCopyrightGuestFiling({
        noticeId: scene.noticeId,
        token: scene.filer.token,
        now: new Date(),
        kind: 'supplement',
        statement: `withdrawn-${crypto.randomUUID()}`,
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: 'Copyright guest capability is not valid for this notice',
    })
    expect(await readWithdrawalState([scene.noticeId, scene.otherNoticeId])).toEqual(before)
  })
})
