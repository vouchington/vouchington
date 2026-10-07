import { describe, expect, it } from 'vitest'
import { createSesBounceEvent } from './create.mts'
describe('createSesBounceEvent', () => {
  it('creates a bounce event', async () => {
    const event = await createSesBounceEvent({
      notification_type: 'bounce',
      bounce_type: 'permanent',
      amazon_ses_bounce_subtype_id: 'General',
      recipients: ['tests+bounce@voucha.ai'],
      amazon_ses_message_id: `msg-${Math.random().toString(36).slice(2)}`,
      amazon_ses_feedback_id: `fb-${Math.random().toString(36).slice(2)}`,
      occurred_at: new Date('2024-01-01T00:00:00Z'),
      raw_message: { notificationType: 'Bounce' },
      diagnostic_code: '550 5.1.1 User unknown',
      reporting_mta: 'smtp.example.com',
    })
    expect(event).not.toBeNull()
    expect(event?.id).toBeDefined()
    expect(event?.notification_type).toBe('bounce')
    expect(event?.bounce_type).toBe('permanent')
    expect(event?.amazon_ses_bounce_subtype_id).toBe('General')
    expect(event?.recipients).toEqual(['tests+bounce@voucha.ai'])
    expect(event?.diagnostic_code).toBe('550 5.1.1 User unknown')
    expect(event?.reporting_mta).toBe('smtp.example.com')
    expect(event?.raw_message).toEqual({ notificationType: 'Bounce' })
  })

  it('creates a complaint event', async () => {
    const event = await createSesBounceEvent({
      notification_type: 'complaint',
      recipients: ['tests+complaint@voucha.ai'],
      amazon_ses_message_id: `msg-${Math.random().toString(36).slice(2)}`,
      amazon_ses_feedback_id: `fb-${Math.random().toString(36).slice(2)}`,
      raw_message: { notificationType: 'Complaint' },
    })
    expect(event?.notification_type).toBe('complaint')
    expect(event?.bounce_type).toBeNull()
    expect(event?.recipients).toEqual(['tests+complaint@voucha.ai'])
  })

  it('creates a delivery event', async () => {
    const event = await createSesBounceEvent({
      notification_type: 'delivery',
      recipients: ['tests+success@voucha.ai'],
      amazon_ses_message_id: `msg-${Math.random().toString(36).slice(2)}`,
      raw_message: { notificationType: 'Delivery' },
    })
    expect(event?.notification_type).toBe('delivery')
    expect(event?.recipients).toEqual(['tests+success@voucha.ai'])
  })

  it('rejects an invalid notification_type', async () => {
    await expect(
      createSesBounceEvent({
        notification_type: 'invalid' as 'bounce',
        recipients: [],
        raw_message: {},
      }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('rejects an invalid bounce_type', async () => {
    await expect(
      createSesBounceEvent({
        notification_type: 'bounce',
        bounce_type: 'invalid' as 'permanent',
        recipients: [],
        raw_message: {},
      }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('stores raw_message as JSONB and recipients as array', async () => {
    const rawMessage = { notificationType: 'Bounce', nested: { key: 'value' }, arr: [1, 2, 3] }
    const recipients = ['tests+a@voucha.ai', 'tests+b@voucha.ai']

    const event = await createSesBounceEvent({
      notification_type: 'bounce',
      bounce_type: 'transient',
      recipients,
      raw_message: rawMessage,
    })
    expect(event?.raw_message).toEqual(rawMessage)
    expect(event?.recipients).toEqual(recipients)
  })

  it('derives dedup_key from amazon_ses_message_id, notification_type, and occurred_at', async () => {
    const messageId = `msg-${Math.random().toString(36).slice(2)}`
    const timestamp = new Date('2024-01-01T00:00:00.000Z')
    const recipientsA = ['tests+a@voucha.ai', 'tests+b@voucha.ai']
    const recipientsB = ['tests+b@voucha.ai', 'tests+a@voucha.ai']

    const first = await createSesBounceEvent({
      notification_type: 'delivery',
      recipients: recipientsA,
      amazon_ses_message_id: messageId,
      occurred_at: timestamp,
      raw_message: { notificationType: 'Delivery' },
    })
    const second = await createSesBounceEvent({
      notification_type: 'delivery',
      recipients: recipientsB,
      amazon_ses_message_id: messageId,
      occurred_at: timestamp,
      raw_message: { notificationType: 'Delivery' },
    })

    expect(first?.dedup_key).toMatch(/^[0-9a-f]{64}$/)
    expect(second).toBeNull() // Deduplicated because the key is identical
  })

  it('leaves dedup_key null when amazon_ses_message_id or occurred_at is missing', async () => {
    const event = await createSesBounceEvent({
      notification_type: 'delivery',
      recipients: ['tests+no-dedup-key@voucha.ai'],
      raw_message: { notificationType: 'Delivery' },
    })
    expect(event?.dedup_key).toBeNull()
  })

  it('redelivering the same message is a no-op, not a duplicate row', async () => {
    const email = `tests+redelivered-${Math.random().toString(36).slice(2)}@voucha.ai`
    const subtype = `FutureSubtype-${Math.random().toString(36).slice(2)}`
    const input = {
      notification_type: 'bounce' as const,
      bounce_type: 'permanent' as const,
      amazon_ses_bounce_subtype_id: subtype,
      recipients: [email],
      amazon_ses_message_id: `msg-${Math.random().toString(36).slice(2)}`,
      occurred_at: new Date('2024-01-01T00:00:00.000Z'),
      raw_message: { notificationType: 'Bounce' },
    }

    const first = await createSesBounceEvent(input)
    const redelivered = await createSesBounceEvent(input)

    expect(first?.id).toBeDefined()
    expect(first?.amazon_ses_bounce_subtype_id).toBe(subtype)
    expect(redelivered).toBeNull()
  })

  it('two distinct notification types on the same mail.messageId are not deduplicated against each other', async () => {
    const sharedMessageId = `msg-${Math.random().toString(36).slice(2)}`
    const timestamp = new Date('2024-01-01T00:00:00.000Z')

    const delivery = await createSesBounceEvent({
      notification_type: 'delivery',
      recipients: ['tests+recipient-a@voucha.ai', 'tests+recipient-b@voucha.ai'],
      amazon_ses_message_id: sharedMessageId,
      occurred_at: timestamp,
      raw_message: { notificationType: 'Delivery' },
    })
    const bounce = await createSesBounceEvent({
      notification_type: 'bounce',
      bounce_type: 'permanent',
      recipients: ['tests+recipient-a@voucha.ai'],
      amazon_ses_message_id: sharedMessageId,
      occurred_at: timestamp,
      raw_message: { notificationType: 'Bounce' },
    })

    expect(delivery?.id).toBeDefined()
    expect(bounce?.id).toBeDefined()
    expect(bounce?.id).not.toBe(delivery?.id)
  })

  it('two distinct recipients sharing mail.messageId, type, and timestamp are not deduplicated against each other', async () => {
    const sharedMessageId = `msg-${Math.random().toString(36).slice(2)}`
    const timestamp = new Date('2024-01-01T00:00:00.000Z')

    const first = await createSesBounceEvent({
      notification_type: 'delivery',
      recipients: ['tests+split-recipient-a@voucha.ai'],
      amazon_ses_message_id: sharedMessageId,
      occurred_at: timestamp,
      raw_message: { notificationType: 'Delivery' },
    })
    const second = await createSesBounceEvent({
      notification_type: 'delivery',
      recipients: ['tests+split-recipient-b@voucha.ai'],
      amazon_ses_message_id: sharedMessageId,
      occurred_at: timestamp,
      raw_message: { notificationType: 'Delivery' },
    })

    expect(first?.id).toBeDefined()
    expect(second?.id).toBeDefined()
    expect(second?.id).not.toBe(first?.id)
  })
})
