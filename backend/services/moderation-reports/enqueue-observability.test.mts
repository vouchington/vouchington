import { describe, expect, it } from 'vitest'
import { decorateModerationEnqueueError } from './enqueue-observability.mts'

describe('decorateModerationEnqueueError', () => {
  it('sets tags and extra on the error', () => {
    const err = new Error('enqueue failed')
    const result = decorateModerationEnqueueError(err, {
      stage: 'report-judgement',
      reportId: 'r1',
      entityType: 'post',
      entityId: 'e1',
    })
    expect(result).toBe(err)
    const extended = err as Error & {
      tags?: Record<string, string | number | boolean>
      extra?: Record<string, unknown>
    }
    expect(extended.tags).toEqual({ moderation_enqueue_stage: 'report-judgement' })
    expect(extended.extra).toEqual({ entity_type: 'post', entity_id: 'e1', report_id: 'r1' })
  })

  it('omits report_id when not provided', () => {
    const err = new Error('enqueue failed')
    decorateModerationEnqueueError(err, {
      stage: 'report-integrity',
      entityType: 'user',
      entityId: 'u1',
    })
    const extended = err as Error & {
      extra?: Record<string, unknown>
    }
    expect(extended.extra).not.toHaveProperty('report_id')
    expect(extended.extra).toEqual({ entity_type: 'user', entity_id: 'u1' })
  })
})
