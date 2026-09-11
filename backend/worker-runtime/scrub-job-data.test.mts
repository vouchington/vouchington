import { describe, expect, it } from 'vitest'
import { scrubJobData } from './scrub-job-data.mts'

describe('scrubJobData', () => {
  it('returns undefined for missing, non-object, array, or empty payloads', () => {
    expect(scrubJobData(undefined)).toBeUndefined()
    expect(scrubJobData(null)).toBeUndefined()
    expect(scrubJobData('a string')).toBeUndefined()
    expect(scrubJobData(['not-an-object'])).toBeUndefined()
    expect(scrubJobData({})).toBeUndefined()
  })

  it('redacts PII/secret-shaped keys regardless of value shape', () => {
    expect(
      scrubJobData({
        emailAddress: 'tests+scrub@voucha.ai',
        email_address: 'tests+scrub@voucha.ai',
        token: 'login-token',
        password: 'hunter2',
        physicalAddress: '123 Main St',
        ipAddress: '203.0.113.5',
        phone_number: '+15551234567',
        session_id: 'abc123',
        contactName: 'Jane Doe',
        senderName: 'Jane Doe',
        inviterName: 'Jane Doe',
      }),
    ).toEqual({
      contactName: '[Filtered]',
      email_address: '[Filtered]',
      emailAddress: '[Filtered]',
      inviterName: '[Filtered]',
      ipAddress: '[Filtered]',
      password: '[Filtered]',
      phone_number: '[Filtered]',
      physicalAddress: '[Filtered]',
      senderName: '[Filtered]',
      session_id: '[Filtered]',
      token: '[Filtered]',
    })
  })

  it('keeps safe scalars: booleans, numbers, uuids, ulids, and short enum-like strings', () => {
    expect(
      scrubJobData({
        active: true,
        retries: 3,
        userId: '11111111-1111-4111-8111-111111111111',
        requestId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        status: 'processing',
        provider: 'us-west-2',
      }),
    ).toEqual({
      active: true,
      provider: 'us-west-2',
      requestId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      retries: 3,
      status: 'processing',
      userId: '11111111-1111-4111-8111-111111111111',
    })
  })

  it('redacts free-text/unstructured string values by default', () => {
    expect(
      scrubJobData({
        subject: 'Welcome to Voucha!',
        bodyHtml: '<p>Hi there</p>',
        note: 'contains PII maybe',
      }),
    ).toEqual({
      bodyHtml: '[Filtered]',
      note: '[Filtered]',
      subject: '[Filtered]',
    })
  })

  it('preserves null and undefined leaf values', () => {
    expect(scrubJobData({ optional: null, missing: undefined, kept: 'ok' })).toEqual({
      kept: 'ok',
      missing: undefined,
      optional: null,
    })
  })

  it('recurses into nested objects and arrays, scrubbing PII at every depth', () => {
    expect(
      scrubJobData({
        recipient: { emailAddress: 'tests+scrub@voucha.ai', userId: 'user-123' },
        items: [{ token: 'abc' }, { status: 'ok' }],
      }),
    ).toEqual({
      items: [{ token: '[Filtered]' }, { status: 'ok' }],
      recipient: { emailAddress: '[Filtered]', userId: 'user-123' },
    })
  })

  it('caps object keys at 32, sorted, and arrays at 10 items with a remainder marker', () => {
    const manyKeys = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, i]))
    const scrubbed = scrubJobData(manyKeys) as Record<string, unknown>
    expect(Object.keys(scrubbed)).toEqual(Object.keys(manyKeys).sort().slice(0, 32))

    const scrubbedArray = scrubJobData({ items: Array.from({ length: 15 }, (_, i) => i) })
    expect(scrubbedArray).toEqual({
      items: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, '...5 more'],
    })
  })

  it('redacts objects nested past the max depth instead of recursing indefinitely', () => {
    const deeplyNested = { a: { b: { c: { d: { e: 'status' } } } } }
    expect(scrubJobData(deeplyNested)).toEqual({
      a: { b: { c: { d: '[Filtered]' } } },
    })
  })
})
