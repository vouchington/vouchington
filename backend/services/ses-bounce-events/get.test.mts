import { describe, expect, it } from 'vitest'
import { createSesBounceEvent } from './create.mts'
import { isEmailSuppressed } from './get.mts'
import { beginTransaction, getTestSesAddressSuppression } from '@voucha/test-helpers'
describe('isEmailSuppressed', () => {
  it('returns true for permanently bounced email', async () => {
    const email = `tests+bounce-${Math.random().toString(36).slice(2)}@voucha.ai`

    await createSesBounceEvent({
      notification_type: 'bounce',
      bounce_type: 'permanent',
      recipients: [email],
      raw_message: { notificationType: 'Bounce' },
    })
    const suppressed = await isEmailSuppressed(email)
    expect(suppressed).toBe(true)
  })

  it('returns false for transient bounce', async () => {
    const email = `tests+transient-${Math.random().toString(36).slice(2)}@voucha.ai`

    await createSesBounceEvent({
      notification_type: 'bounce',
      bounce_type: 'transient',
      recipients: [email],
      raw_message: { notificationType: 'Bounce' },
    })
    const suppressed = await isEmailSuppressed(email)
    expect(suppressed).toBe(false)
  })

  it('returns true for a complaint event', async () => {
    const email = `tests+complaint-${Math.random().toString(36).slice(2)}@voucha.ai`

    await createSesBounceEvent({
      notification_type: 'complaint',
      recipients: [email],
      raw_message: { notificationType: 'Complaint' },
    })
    const suppressed = await isEmailSuppressed(email)
    expect(suppressed).toBe(true)
  })

  it('returns false for email that has not bounced', async () => {
    const email = `tests+no-bounce-${Math.random().toString(36).slice(2)}@voucha.ai`
    const suppressed = await isEmailSuppressed(email)
    expect(suppressed).toBe(false)
  })

  it('folds permanent bounces and complaints into one address row in event-time order', async () => {
    const email = `tests+fold-${Math.random().toString(36).slice(2)}@voucha.ai`
    const firstAt = new Date('2026-01-01T00:00:00Z')
    const latestAt = new Date('2026-01-03T00:00:00Z')
    await createSesBounceEvent({
      notification_type: 'complaint',
      recipients: [email.toUpperCase(), email],
      occurred_at: latestAt,
      raw_message: { notificationType: 'Complaint' },
    })
    await createSesBounceEvent({
      notification_type: 'bounce',
      bounce_type: 'permanent',
      recipients: [email],
      occurred_at: firstAt,
      raw_message: { notificationType: 'Bounce' },
    })
    await using query = await beginTransaction()
    expect(await getTestSesAddressSuppression(query, email)).toEqual({
      first_event_at: firstAt,
      first_notification_type: 'bounce',
      latest_event_at: latestAt,
      latest_notification_type: 'complaint',
    })
    expect(await isEmailSuppressed(email.toUpperCase())).toBe(true)
  })
})
