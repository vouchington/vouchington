import { describe, expect, it } from 'vitest'
import { entityJobContractCoversCanonicalTypes, parseEntityJob } from './job-payload.mts'

describe('parseEntityJob', () => {
  it('covers the canonical entity job names', () => {
    expect(entityJobContractCoversCanonicalTypes()).toBe(true)
  })

  it('rejects an optional flag or enum that is the wrong type', () => {
    expect(() =>
      parseEntityJob('processPostUpdated', { id: 'post', contentChanged: 'yes' }),
    ).toThrow(/contentChanged must be a boolean/)
    expect(() =>
      parseEntityJob('processTopicCreated', {
        id: 'topic',
        updates: { name: 'News', slug: 'news', topic_type: 'not-a-topic' },
      }),
    ).toThrow(/topic_type is not a known value/)
    expect(() =>
      parseEntityJob('processTopicCreated', {
        id: 'topic',
        updates: { name: 'News', slug: 'news', noindex: 'yes' },
      }),
    ).toThrow(/noindex must be a boolean/)
    expect(() => parseEntityJob('missingJob', {})).toThrow(/unknown job missingJob/)
  })
})
