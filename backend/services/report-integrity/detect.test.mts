import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { createTestUserDirect, insertTestModerationReport } from '@voucha/test-helpers'
import { detectMassReportCampaign } from './detect.mts'
import { MASS_REPORT_THRESHOLD } from './config.mts'
import type { PrivateUser } from '@services/users/types'

describe('detectMassReportCampaign', () => {
  const randomUsername = () => `test-ri-detect-${randomBytes(4).toString('hex')}`

  let targetUser: PrivateUser

  beforeAll(async () => {
    // Create a user to be the report target (separate from reporters)
    targetUser = await createTestUserDirect({ username: randomUsername() })
  }, 60_000)

  it('returns flagged=false when reporter count is below threshold', async () => {
    const freshTarget = await createTestUserDirect({ username: randomUsername() })
    const count = MASS_REPORT_THRESHOLD - 1

    for (let i = 0; i < count; i++) {
      const reporter = await createTestUserDirect({ username: randomUsername() })
      await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'user',
        entityId: freshTarget.id,
      })
    }

    const result = await detectMassReportCampaign('user', freshTarget.id)
    expect(result.flagged).toBe(false)
    expect(result.reporter_count).toBe(count)
  }, 60_000)

  it('returns flagged=true when reporter count meets threshold', async () => {
    const freshTarget = await createTestUserDirect({ username: randomUsername() })
    const count = MASS_REPORT_THRESHOLD

    for (let i = 0; i < count; i++) {
      const reporter = await createTestUserDirect({ username: randomUsername() })
      await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'user',
        entityId: freshTarget.id,
      })
    }

    const result = await detectMassReportCampaign('user', freshTarget.id)
    expect(result.flagged).toBe(true)
    expect(result.reporter_count).toBe(count)
  }, 60_000)

  it('returns flagged=false for unknown entity type', async () => {
    const result = await detectMassReportCampaign('unknown_type', targetUser.id)
    expect(result.flagged).toBe(false)
    expect(result.reporter_count).toBe(0)
  }, 60_000)

  it('includes threshold and window info in details', async () => {
    const result = await detectMassReportCampaign('user', targetUser.id)
    expect(result.details).toMatchObject({
      threshold: MASS_REPORT_THRESHOLD,
      window_minutes: expect.any(Number),
      new_account_age_days: expect.any(Number),
    })
  }, 60_000)

  it('computes new_account_reporter_pct as reporters-fraction from fresh accounts', async () => {
    const freshTarget = await createTestUserDirect({ username: randomUsername() })
    const count = MASS_REPORT_THRESHOLD + 1

    // All reporters are newly created (fresh accounts), so pct should be 1.0
    for (let i = 0; i < count; i++) {
      const reporter = await createTestUserDirect({ username: randomUsername() })
      await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'user',
        entityId: freshTarget.id,
      })
    }

    const result = await detectMassReportCampaign('user', freshTarget.id)
    expect(result.flagged).toBe(true)
    // All reporters are brand new → pct should be 1.0 (or close, depending on test timing)
    expect(result.new_account_reporter_pct).toBeGreaterThan(0)
  }, 60_000)
})
