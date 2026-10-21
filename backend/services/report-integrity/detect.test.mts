import { describe, it, expect, beforeAll } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { randomBytes, randomInt } from 'node:crypto'
import assert from 'node:assert/strict'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { createTestUserWithId, insertTestModerationReport } from '@voucha/test-helpers'
import { detectMassReportCampaign } from './detect.mts'
import {
  MASS_REPORT_THRESHOLD,
  MASS_REPORT_WINDOW_MINUTES,
  NEW_ACCOUNT_AGE_DAYS,
} from './config.mts'

const DETECTION_NOW = Date.UTC(2026, 1, 1, 0, 2)
const AS_OF = new Date(DETECTION_NOW)

describe('detectMassReportCampaign', () => {
  const randomUsername = () => `test-ri-detect-${randomBytes(4).toString('hex')}`

  let targetUserId: string

  beforeAll(async () => {
    // Create a user to be the report target (separate from reporters)
    targetUserId = await historicalTargetId()
  }, 5_000)

  async function historicalTargetId(): Promise<string> {
    const id = uuidv7({ msecs: Date.UTC(2025, 11, 1) })
    await createTestUserWithId(id, randomUsername())
    return id
  }

  it('returns flagged=false when reporter count is below threshold', async () => {
    const targetId = await historicalTargetId()
    const count = MASS_REPORT_THRESHOLD - 1

    for (let i = 0; i < count; i++) {
      const reporterId = uuidv7({ msecs: DETECTION_NOW, seq: 0 })
      await createTestUserWithId(reporterId, randomUsername())
      await insertTestModerationReport({
        reporterUserId: reporterId,
        createdAt: new Date(DETECTION_NOW),
        entityType: 'user',
        entityId: targetId,
      })
    }

    const result = await detectMassReportCampaign('user', targetId, AS_OF)
    expect(result.flagged).toBe(false)
    expect(result.reporter_count).toBe(count)
  })

  it('returns flagged=true when reporter count meets threshold', async () => {
    const targetId = await historicalTargetId()
    const count = MASS_REPORT_THRESHOLD

    for (let i = 0; i < count; i++) {
      const reporterId = uuidv7({ msecs: DETECTION_NOW, seq: 0 })
      await createTestUserWithId(reporterId, randomUsername())
      await insertTestModerationReport({
        reporterUserId: reporterId,
        createdAt: new Date(DETECTION_NOW),
        entityType: 'user',
        entityId: targetId,
      })
    }

    const result = await detectMassReportCampaign('user', targetId, AS_OF)
    expect(result.flagged).toBe(true)
    expect(result.reporter_count).toBe(count)
  })

  it('returns flagged=false for unknown entity type', async () => {
    const result = await detectMassReportCampaign('unknown_type', targetUserId, AS_OF)
    expect(result.flagged).toBe(false)
    expect(result.reporter_count).toBe(0)
  })

  it('includes threshold and window info in details', async () => {
    const result = await detectMassReportCampaign('user', targetUserId, AS_OF)
    expect(result.details).toMatchObject({
      threshold: MASS_REPORT_THRESHOLD,
      window_minutes: expect.any(Number),
      new_account_age_days: expect.any(Number),
    })
  })

  it('computes new_account_reporter_percent as reporters-fraction from fresh accounts', async () => {
    const targetId = await historicalTargetId()
    const count = MASS_REPORT_THRESHOLD + 1

    // All reporters are newly created (fresh accounts), so pct should be 1.0
    for (let i = 0; i < count; i++) {
      const reporterId = uuidv7({ msecs: DETECTION_NOW, seq: 0 })
      await createTestUserWithId(reporterId, randomUsername())
      await insertTestModerationReport({
        reporterUserId: reporterId,
        createdAt: new Date(DETECTION_NOW),
        entityType: 'user',
        entityId: targetId,
      })
    }

    const result = await detectMassReportCampaign('user', targetId, AS_OF)
    expect(result.flagged).toBe(true)
    expect(result.new_account_reporter_percent).toBe(1)
  })

  it('includes the one-hour boundary and excludes the previous millisecond', async () => {
    const targetId = await historicalTargetId()
    // Stay within the first hour of February so the report window crosses January.
    const asOfMs = DETECTION_NOW + randomInt(0, 58 * 60_000)
    const cutoff = asOfMs - MASS_REPORT_WINDOW_MINUTES * 60_000
    const reporterIds: string[] = []
    for (let i = 0; i < 3; i++) {
      const reporterId = uuidv7({ msecs: asOfMs - 86_400_000, seq: i })
      await createTestUserWithId(reporterId, randomUsername())
      reporterIds.push(reporterId)
    }
    for (const [index, offset] of [-1, 0, 1].entries()) {
      await insertTestModerationReport({
        reporterUserId: reporterIds[index]!,
        createdAt: new Date(cutoff + offset),
        id: offset === 0 ? getMinUUIDv7ForDate(new Date(cutoff)) : undefined,
        entityType: 'user',
        entityId: targetId,
      })
    }

    const atCutoff = await detectMassReportCampaign('user', targetId, new Date(asOfMs))
    const afterCutoff = await detectMassReportCampaign('user', targetId, new Date(asOfMs + 1))
    assert.equal(atCutoff.reporter_count, 2, `asOf=${new Date(asOfMs).toISOString()}`)
    assert.equal(afterCutoff.reporter_count, 1, `asOf=${new Date(asOfMs).toISOString()}`)
  })

  it('counts reporter accounts at the 30-day boundary but not one millisecond before', async () => {
    const targetId = await historicalTargetId()
    const asOfMs = DETECTION_NOW + randomInt(0, 58 * 60_000)
    const accountCutoff = asOfMs - NEW_ACCOUNT_AGE_DAYS * 86_400_000
    for (const [index, offset] of [-1, 0, 1].entries()) {
      const reporterId =
        offset === 0
          ? getMinUUIDv7ForDate(new Date(accountCutoff))
          : uuidv7({ msecs: accountCutoff + offset, seq: index })
      await createTestUserWithId(reporterId, randomUsername())
      await insertTestModerationReport({
        reporterUserId: reporterId,
        createdAt: new Date(asOfMs),
        entityType: 'user',
        entityId: targetId,
      })
    }

    const result = await detectMassReportCampaign('user', targetId, new Date(asOfMs))
    expect(result.reporter_count).toBe(3)
    assert.ok(
      Math.abs(result.new_account_reporter_percent - 2 / 3) < 0.005,
      `asOf=${new Date(asOfMs).toISOString()}`,
    )
  })

  it('rejects an invalid reference instant', async () => {
    await expect(
      detectMassReportCampaign('user', targetUserId, new Date(Number.NaN)),
    ).rejects.toThrow('asOf must be a finite date')
  })
})
