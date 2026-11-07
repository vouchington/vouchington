import { describe, expect, it } from 'vitest'
import { canonicalTopicLabelJoins } from './index.mts'

describe('canonicalTopicLabelJoins', () => {
  it('rejects an unsupported source at runtime', () => {
    expect(() => canonicalTopicLabelJoins('unknown' as 'claim')).toThrow(
      'Unsupported canonical topic label source: unknown',
    )
  })
})
