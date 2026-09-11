import { describe, expect, it } from 'vitest'
import { createPrioritizedReferralLinksBaseQueryForTest } from '@voucha/test-helpers'
import { appendPrioritizedLinksQuery } from './query-helpers.mts'

describe('appendPrioritizedLinksQuery', () => {
  it('does not truncate the complete all-links contract', () => {
    const query = createPrioritizedReferralLinksBaseQueryForTest()

    appendPrioritizedLinksQuery(query, { all: true, limit: 5 })

    expect(query.text).not.toContain('LIMIT')
  })

  it('limits only lower-priority personal links in the prioritized view', () => {
    const query = createPrioritizedReferralLinksBaseQueryForTest()

    appendPrioritizedLinksQuery(query, { all: false, limit: 5 })

    expect(query.text.match(/LIMIT/g)).toHaveLength(1)
    expect(query.text).toContain('LIMIT GREATEST')
  })
})
