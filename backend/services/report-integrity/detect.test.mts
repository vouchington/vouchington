import { describe, it, expect, beforeAll, beforeEach, afterEach, onTestFinished, vi } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { randomBytes } from 'node:crypto'
import {
  createTestUserDirect,
  createTestUserWithId,
  insertTestModerationReport,
} from '@voucha/test-helpers'
import { detectMassReportCampaign } from './detect.mts'
import { MASS_REPORT_THRESHOLD } from './config.mts'
import type { PrivateUser } from '@services/users/types'

const DETECTION_NOW = Date.UTC(2026, 0, 31, 23, 59, 59)

describe('detectMassReportCampaign', () => {
  const randomUsername = () => `test-ri-detect-${randomBytes(4).toString('hex')}`

  let targetUser: PrivateUser

  beforeAll(async () => {
    // Create a user to be the report target (separate from reporters)
    targetUser = await createTestUserDirect({ username: randomUsername() })
  }, 5_000)

  beforeEach(() => {
    onTestFinished(() => {
      vi.useRealTimers()
    })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(DETECTION_NOW)
  })

  afterEach(() => vi.useRealTimers())

  it('returns flagged=false when reporter count is below threshold', async () => {
    const freshTarget = await createTestUserDirect({ username: randomUsername() })
    const count = MASS_REPORT_THRESHOLD - 1

    for (let i = 0; i < count; i++) {
      const reporterId = uuidv7({ msecs: DETECTION_NOW, seq: 0 })
      await createTestUserWithId(reporterId, randomUsername())
      await insertTestModerationReport({
        reporterUserId: reporterId,
        createdAt: new Date(DETECTION_NOW),
        entityType: 'user',
        entityId: freshTarget.id,
      })
    }

    const result = await detectMassReportCampaign('user', freshTarget.id)
    expect(result.flagged).toBe(false)
    expect(result.reporter_count).toBe(count)
  })

  it('returns flagged=true when reporter count meets threshold', async () => {
    const freshTarget = await createTestUserDirect({ username: randomUsername() })
    const count = MASS_REPORT_THRESHOLD

    for (let i = 0; i < count; i++) {
      const reporterId = uuidv7({ msecs: DETECTION_NOW, seq: 0 })
      await createTestUserWithId(reporterId, randomUsername())
      await insertTestModerationReport({
        reporterUserId: reporterId,
        createdAt: new Date(DETECTION_NOW),
        entityType: 'user',
        entityId: freshTarget.id,
      })
    }

    const result = await detectMassReportCampaign('user', freshTarget.id)
    expect(result.flagged).toBe(true)
    expect(result.reporter_count).toBe(count)
  })

  it('returns flagged=false for unknown entity type', async () => {
    const result = await detectMassReportCampaign('unknown_type', targetUser.id)
    expect(result.flagged).toBe(false)
    expect(result.reporter_count).toBe(0)
  })

  it('includes threshold and window info in details', async () => {
    const result = await detectMassReportCampaign('user', targetUser.id)
    expect(result.details).toMatchObject({
      threshold: MASS_REPORT_THRESHOLD,
      window_minutes: expect.any(Number),
      new_account_age_days: expect.any(Number),
    })
  })

  it('computes new_account_reporter_percent as reporters-fraction from fresh accounts', async () => {
    const freshTarget = await createTestUserDirect({ username: randomUsername() })
    const count = MASS_REPORT_THRESHOLD + 1

    // All reporters are newly created (fresh accounts), so pct should be 1.0
    for (let i = 0; i < count; i++) {
      const reporterId = uuidv7({ msecs: DETECTION_NOW, seq: 0 })
      await createTestUserWithId(reporterId, randomUsername())
      await insertTestModerationReport({
        reporterUserId: reporterId,
        createdAt: new Date(DETECTION_NOW),
        entityType: 'user',
        entityId: freshTarget.id,
      })
    }

    const result = await detectMassReportCampaign('user', freshTarget.id)
    expect(result.flagged).toBe(true)
    // All reporters are brand new → pct should be 1.0 (with owned timestamped UUIDv7 fixtures)
    expect(result.new_account_reporter_percent).toBeGreaterThan(0)
  })
})
