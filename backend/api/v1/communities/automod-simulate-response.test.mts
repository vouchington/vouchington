import { describe, expect, it } from 'vitest'
import { createAutomodSimulationResults } from './automod-simulate-response.mts'

describe('createAutomodSimulationResults', () => {
  it('maps sampled posts to projected moderation result rows', () => {
    const results = createAutomodSimulationResults(
      [
        {
          id: 'post-1',
          title: 'Sample post',
          markdown: 'Body',
          declared_language: 'ar',
          lingua_rs_detected_language: 'en',
          post_type: 'discussion',
          created_by_id: 'user-1',
          approved_at: new Date('2026-01-02T00:00:00Z'),
          content_excerpt: 'Sample post Body',
        },
      ],
      [{ post_id: 'post-1', flagged: true, reason: 'Matches rule' }],
    )

    expect(results).toEqual([
      {
        post_id: 'post-1',
        title: 'Sample post',
        declared_language: 'ar',
        lingua_rs_detected_language: 'en',
        post_type: 'discussion',
        approved_at: '2026-01-02T00:00:00.000Z',
        content_excerpt: 'Sample post Body',
        flagged: true,
        reason: 'Matches rule',
      },
    ])
  })
})
