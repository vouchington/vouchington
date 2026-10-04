import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import {
  createTestHistoricalEuDecisionWindow,
  insertTestHistoricalTerritorialComplaint,
  insertTestTerritorialDecisionIntent,
  readTestTerritorialInformedWindow,
} from '@voucha/test-helpers/copyright-territorial-historical-window'
import { submitEuCopyrightRedress } from './eu-redress.mts'

describe('EU complaint windows follow actual decision delivery', () => {
  it.each(['pending', 'failed', 'bounced'] as const)(
    'allows a signed-in notifier to complain when decision delivery is %s',
    async initialState => {
      const notifier = await createTestUser()
      const fixture = await createTestHistoricalEuDecisionWindow({
        requesterUserId: notifier.id,
        initialState,
      })
      const window = await readTestTerritorialInformedWindow({
        noticeId: fixture.noticeId,
        decidedAt: fixture.decidedAt,
        notifier: true,
      })
      expect(window.window_ends_at).toBeNull()
      const complaint = await submitEuCopyrightRedress(
        notifier,
        fixture.noticeId,
        crypto.randomUUID(),
        'Please reconsider',
      )
      expect(complaint.is_duplicate).toBe(false)
    },
  )

  it('ends a sent notifier window, while replaying a complaint filed inside it', async () => {
    const notifier = await createTestUser()
    const fixture = await createTestHistoricalEuDecisionWindow({ requesterUserId: notifier.id })
    const key = crypto.randomUUID()
    const earlier = await insertTestHistoricalTerritorialComplaint({
      noticeId: fixture.noticeId,
      requesterUserId: notifier.id,
      idempotencyKey: key,
      receivedAt: new Date(fixture.windowEndsAt.getTime() - 1_000),
    })
    const replay = await submitEuCopyrightRedress(
      notifier,
      fixture.noticeId,
      key,
      'Please reconsider',
    )
    expect(replay).toEqual({ id: earlier, is_duplicate: true })
    const expired = await createTestHistoricalEuDecisionWindow({ requesterUserId: notifier.id })
    await expect(
      submitEuCopyrightRedress(
        notifier,
        expired.noticeId,
        crypto.randomUUID(),
        'A new complaint after expiry',
      ),
    ).rejects.toMatchObject({
      status: 422,
      message: 'The complaint period for this decision has ended',
    })
  })

  it('keeps a dual-role actor unbounded until both decision notices are sent', async () => {
    const actor = await createTestUser()
    const fixture = await createTestHistoricalEuDecisionWindow({ requesterUserId: actor.id })
    const input = {
      noticeId: fixture.noticeId,
      decidedAt: fixture.decidedAt,
      posterUserId: actor.id,
      notifier: true,
    }
    expect((await readTestTerritorialInformedWindow(input)).window_ends_at).toBeNull()
    const laterPosterDelivery = new Date(fixture.decidedAt.getTime() + 86_400_000)
    await insertTestTerritorialDecisionIntent({
      noticeId: fixture.noticeId,
      role: 'poster',
      userId: actor.id,
      state: 'sent',
      at: laterPosterDelivery,
    })
    const both = await readTestTerritorialInformedWindow(input)
    expect(both.window_ends_at).toEqual(
      new Date(
        Date.UTC(
          laterPosterDelivery.getUTCFullYear(),
          laterPosterDelivery.getUTCMonth() + 6,
          laterPosterDelivery.getUTCDate(),
          laterPosterDelivery.getUTCHours(),
        ),
      ),
    )
    expect(both.informed_at).toEqual(new Date(fixture.decidedAt.getTime() + 3_600_000))
  })

  it('does not start one poster’s clock from another poster’s delivery', async () => {
    const [firstPoster, otherPoster] = await Promise.all([createTestUser(), createTestUser()])
    const fixture = await createTestHistoricalEuDecisionWindow({ initialState: 'pending' })
    await insertTestTerritorialDecisionIntent({
      noticeId: fixture.noticeId,
      role: 'poster',
      userId: firstPoster.id,
      state: 'sent',
      at: new Date(fixture.decidedAt.getTime() + 3_600_000),
    })
    const otherWindow = await readTestTerritorialInformedWindow({
      noticeId: fixture.noticeId,
      decidedAt: fixture.decidedAt,
      posterUserId: otherPoster.id,
      notifier: false,
    })
    expect(otherWindow.window_ends_at).toBeNull()
  })

  it('ignores an older decision’s sent notice when a successor is newly decided', async () => {
    const actor = await createTestUser()
    const fixture = await createTestHistoricalEuDecisionWindow({ requesterUserId: actor.id })
    const successorDecidedAt = new Date(fixture.decidedAt.getTime() + 86_400_000)
    const window = await readTestTerritorialInformedWindow({
      noticeId: fixture.noticeId,
      decidedAt: successorDecidedAt,
      notifier: true,
    })
    expect(window.informed_at).toBeNull()
    expect(window.window_ends_at).toBeNull()
  })
})
