import { describe, expect, it } from 'vitest'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import { placeTestAccountPreservationHold } from '@voucha/test-helpers/copyright-mcp-audit'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { createTestPendingOAuthAuthorization } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import {
  insertTestOldDeniedOAuthEvent,
  insertTestRationaleAgePair,
  positionTestOAuthEventRetentionCursor,
  releaseTestOpenPreservationHold,
  testOAuthEventExists,
  testRationaleRetentionEligible,
} from '@voucha/test-helpers/security-retention'
import { cleanupSecuritySourcePageInTransaction } from './security-record-page.mts'
import { sourcePlan } from './security-record-plans.mts'

describe('security evidence preservation', () => {
  it('uses six calendar years for rationale retention, including leap days', () => {
    expect(
      sourcePlan('copyright_rationales_attempts', new Date('2032-02-29T12:34:56.000Z')).cutoffAt,
    ).toEqual(new Date('2026-02-28T12:34:56.000Z'))
    expect(
      sourcePlan('copyright_rationales_erased', new Date('2030-03-01T12:34:56.000Z')).cutoffAt,
    ).toEqual(new Date('2024-03-01T12:34:56.000Z'))
  })

  it('retains an old OAuth event under hold and deletes it after release', async () => {
    const user = await createTestUser()
    const pending = await createTestPendingOAuthAuthorization(user)
    const occurredAt = new Date('2020-01-01T00:00:00.000Z')
    const now = new Date('2021-01-01T01:00:00.000Z')
    await using query = await beginTransaction()
    const eventId = await insertTestOldDeniedOAuthEvent(query, {
      userId: user.id,
      requestId: pending.requestId,
      occurredAt,
    })
    await positionTestOAuthEventRetentionCursor(query, getMinUUIDv7ForDate(occurredAt))
    await placeTestAccountPreservationHold(query, user.id, user.id)
    await cleanupSecuritySourcePageInTransaction(query, 'oauth_events', 32, now)
    expect(await testOAuthEventExists(query, eventId)).toBe(true)
    await releaseTestOpenPreservationHold(query, user.id, user.id)
    await cleanupSecuritySourcePageInTransaction(query, 'oauth_events', 32, now)
    expect(await testOAuthEventExists(query, eventId)).toBe(false)
  })

  it('keeps younger rationales even when a caller supplies a later cutoff', async () => {
    const subject = await createTestUserDirect()
    const actor = await createTestUserDirect({ administrator: true })
    const now = new Date()
    const olderAt = new Date(Date.UTC(now.getUTCFullYear() - 7, 0, 1))
    const youngerAt = new Date(Date.UTC(now.getUTCFullYear() - 5, 0, 1))
    const cutoff = sourcePlan('copyright_rationales_attempts', now).cutoffAt
    await using query = await beginTransaction()
    const [olderId, youngerId] = await insertTestRationaleAgePair(
      query,
      subject.id,
      actor.id,
      olderAt,
      youngerAt,
    )
    expect(await testRationaleRetentionEligible(query, olderId, cutoff)).toBe(true)
    expect(await testRationaleRetentionEligible(query, youngerId, cutoff)).toBe(false)
    expect(await testRationaleRetentionEligible(query, youngerId, now)).toBe(false)
  })
})
