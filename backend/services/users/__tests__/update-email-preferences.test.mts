import { describe, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import assert from 'node:assert'
import { getPrivateUserByAny } from '../get.mts'
import { updateUserFields } from '../update-fields.mts'

describe('updateUserFields email preferences', () => {
  it('updates engagement emails enabled to false', async () => {
    const testUser = await createTestUser()
    await updateUserFields(testUser.id, { engagement_emails_enabled: false })
    const updated = await getPrivateUserByAny(testUser.id)
    assert(updated)
    assert.strictEqual(updated.engagement_emails_enabled, false)
  })

  it('updates moderation email preferences', async () => {
    const testUser = await createTestUser()
    await updateUserFields(testUser.id, {
      moderation_emails_enabled: false,
      moderation_email_cadence: 'selected_days',
      moderation_email_days_of_week: [5, 1, 5],
      moderation_email_time_of_day: '14:30',
      moderation_email_timezone: 'UTC',
    })
    const updated = await getPrivateUserByAny(testUser.id)
    assert(updated)
    assert.strictEqual(updated.moderation_emails_enabled, false)
    assert.strictEqual(updated.moderation_email_cadence, 'selected_days')
    assert.deepStrictEqual(updated.moderation_email_days_of_week, [1, 5])
    assert.strictEqual(updated.moderation_email_time_of_day, '14:30')
    assert.strictEqual(updated.moderation_email_timezone, 'UTC')
  })

  it('updates all notification email preferences together', async () => {
    const testUser = await createTestUser()
    await updateUserFields(testUser.id, {
      engagement_emails_enabled: false,
      moderation_emails_enabled: false,
      moderation_email_cadence: 'selected_days',
      moderation_email_days_of_week: [1, 3, 5],
      moderation_email_time_of_day: '15:30',
      moderation_email_timezone: 'America/New_York',
    })

    const updated = await getPrivateUserByAny(testUser.id)
    assert(updated)
    assert.strictEqual(updated.engagement_emails_enabled, false)
    assert.strictEqual(updated.moderation_emails_enabled, false)
    assert.strictEqual(updated.moderation_email_cadence, 'selected_days')
    assert.deepStrictEqual(updated.moderation_email_days_of_week, [1, 3, 5])
    assert.strictEqual(updated.moderation_email_time_of_day, '15:30')
    assert.strictEqual(updated.moderation_email_timezone, 'America/New_York')
  })

  it('rejects invalid notification email preference values', async () => {
    const testUser = await createTestUser()

    await assert.rejects(
      () =>
        updateUserFields(testUser.id, {
          engagement_emails_enabled: 'yes' as unknown as Parameters<
            typeof updateUserFields
          >[1]['engagement_emails_enabled'],
        }),
      (err: Error & { status?: number }) => {
        assert.strictEqual(err.status, 422)
        return true
      },
    )
    await assert.rejects(
      () =>
        updateUserFields(testUser.id, {
          moderation_email_cadence: 'hourly' as unknown as Parameters<
            typeof updateUserFields
          >[1]['moderation_email_cadence'],
        }),
      (err: Error & { status?: number }) => {
        assert.strictEqual(err.status, 422)
        return true
      },
    )
    await assert.rejects(
      () => updateUserFields(testUser.id, { moderation_email_days_of_week: [1, 8] }),
      (err: Error & { status?: number }) => {
        assert.strictEqual(err.status, 422)
        return true
      },
    )
    await assert.rejects(
      () => updateUserFields(testUser.id, { moderation_email_time_of_day: '24:00' }),
      (err: Error & { status?: number }) => {
        assert.strictEqual(err.status, 422)
        return true
      },
    )
    await assert.rejects(
      () => updateUserFields(testUser.id, { moderation_email_timezone: 'Invalid/Zone' }),
      (err: Error & { status?: number }) => {
        assert.strictEqual(err.status, 422)
        return true
      },
    )
  })
})
