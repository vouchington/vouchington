import { describe, it, expect } from 'vitest'
import {
  encodeCommunityModerationQueueCursor,
  decodeCommunityModerationQueueCursor,
} from './moderation-queue-cursor.mts'

describe('moderation-queue-cursor', () => {
  const validCreatedAt = '2026-01-02T03:04:05.678901Z'
  const validId = '0194f1a2-3b4c-7d8e-9f01-23456789abcd'

  it('round-trips a valid timestamp + UUID cursor', () => {
    const cursor = encodeCommunityModerationQueueCursor({
      cursor_created_at: validCreatedAt,
      id: validId,
    })
    expect(decodeCommunityModerationQueueCursor(cursor)).toEqual({
      afterCreatedAt: validCreatedAt,
      afterId: validId,
    })
  })

  it('returns null for non-base64/non-JSON input', () => {
    expect(decodeCommunityModerationQueueCursor('!!!not base64!!!')).toBeNull()
  })

  it('returns null when created_at is not a microsecond UTC timestamp', () => {
    const bad = Buffer.from(JSON.stringify({ created_at: '2026-01-02', id: validId })).toString(
      'base64url',
    )
    expect(decodeCommunityModerationQueueCursor(bad)).toBeNull()
  })

  it('returns null when id is not a UUID', () => {
    const bad = Buffer.from(
      JSON.stringify({ created_at: validCreatedAt, id: 'not-a-uuid' }),
    ).toString('base64url')
    expect(decodeCommunityModerationQueueCursor(bad)).toBeNull()
  })

  it('returns null when fields are missing or wrong type', () => {
    const bad = Buffer.from(JSON.stringify({ created_at: 123, id: validId })).toString('base64url')
    expect(decodeCommunityModerationQueueCursor(bad)).toBeNull()
  })
})
