import { describe, expect, it } from 'vitest'
import { HashtagTopicSearchError } from '@services/search-params'
import { sendHashtagTopicSearchErrorResponse } from './hashtag-search-error-response.mts'
import type { Context } from '@jongleberry/api-server'

describe('sendHashtagTopicSearchErrorResponse', () => {
  it('writes hashtag topic errors as response payloads', () => {
    const statuses: number[] = []
    const payloads: Array<{ error: string }> = []
    const ctx = {
      setStatus: (status: number) => statuses.push(status),
      json: (payload: { error: string }) => payloads.push(payload),
    } as unknown as Context

    const result = sendHashtagTopicSearchErrorResponse(
      ctx,
      new HashtagTopicSearchError('missing-topic'),
    )

    expect(result).toBeNull()
    expect(statuses).toEqual([400])
    expect(payloads).toEqual([{ error: 'Topic not found: missing-topic' }])
  })

  it('rethrows non-hashtag errors', () => {
    const ctx = {} as Context
    const error = new Error('boom')

    expect(() => sendHashtagTopicSearchErrorResponse(ctx, error)).toThrow(error)
  })
})
