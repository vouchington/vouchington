import { describe, expect, it } from 'vitest'
import { createSesBounceEvent } from './create.mts'
import { isEmailSuppressed } from './get.mts'
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
})
