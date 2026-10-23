import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestHistoricalRetentionWindow,
  getTestRejectedUnfoldedSesRetentionDelete,
  getTestRejectedSesRetentionContextMutations,
  insertTestSesRetentionEvent,
  removeTestSesAddressSuppression,
  testNotificationEmailRetentionRowExists,
} from '@voucha/test-helpers'

describe('raw SES event suppression guard', () => {
  it('keeps an old permanent event when its address has no suppression row', async () => {
    const window = createTestHistoricalRetentionWindow()
    await using query = await beginTransaction()
    const eventId = await insertTestSesRetentionEvent(query, 'permanent', window.firstEligibleDate)
    await removeTestSesAddressSuppression(query, eventId)
    expect(
      await getTestRejectedUnfoldedSesRetentionDelete(query, eventId, window.upperBoundDate),
    ).toMatchObject({
      message: expect.stringMatching(/append-only/),
    })
    expect(
      await testNotificationEmailRetentionRowExists(query, 'amazon_ses_bounce_events', eventId),
    ).toBe(true)
  })

  it('rejects SES updates and unrelated append-only deletes under exact retention context', async () => {
    const window = createTestHistoricalRetentionWindow()
    await using query = await beginTransaction()
    const eventId = await insertTestSesRetentionEvent(query, 'permanent', window.firstEligibleDate)
    const rejected = await getTestRejectedSesRetentionContextMutations(
      query,
      eventId,
      window.firstEligibleDate,
      window.upperBoundDate,
    )
    expect(rejected.eventUpdate).toMatchObject({
      message: expect.stringMatching(/append-only/),
    })
    expect(rejected.unrelatedDelete).toMatchObject({
      message: expect.stringMatching(/append-only/),
    })
  })
})
