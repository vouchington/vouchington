import { createTestUser, insertTestReportJudgement } from '@voucha/test-helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getUndispatchedJudgements, markJudgementDispatched } from './dispatch-state.mts'

describe('moderation judgement dispatch recovery', () => {
  afterEach(() => {
    vi.useRealTimers()
  })
  it('selects only undispatched judgements within the original two-to-thirty-minute window', async () => {
    const now = new Date('2035-06-12T12:00:00.000Z')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
    const users = await Promise.all([createTestUser(), createTestUser(), createTestUser()])
    const [eligible, fresh, expired] = await Promise.all(
      users.map((user, index) =>
        insertTestReportJudgement({
          entityType: 'user',
          entityId: user.id,
          createdAt: new Date(now.getTime() - [10, 1, 40][index]! * 60_000),
        }),
      ),
    )
    const selected = (await getUndispatchedJudgements()).map(row => row.judgement_id)
    expect(selected).toContain(eligible)
    expect(selected).not.toContain(fresh)
    expect(selected).not.toContain(expired)
    await markJudgementDispatched(eligible!)
    expect((await getUndispatchedJudgements()).map(row => row.judgement_id)).not.toContain(eligible)
  })
})
