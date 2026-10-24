import { describe, expect, it } from 'vitest'
import { listItemCountBody, listItemEligibility, listItemJoins } from './item-type-sql.mts'

describe('community list item SQL selector guards', () => {
  it('rejects an unknown item type in each query fragment', () => {
    const type = 'unknown' as Parameters<typeof listItemJoins>[0]
    expect(() => listItemJoins(type)).toThrow('Unknown community list item type')
    expect(() => listItemEligibility(type, null)).toThrow('Unknown community list item type')
    expect(() => listItemCountBody(type, 'community-id', 'topic_id', null)).toThrow(
      'Unknown community list item type',
    )
  })
})
