import { describe, expect, it } from 'vitest'
import {
  flattenRestrictions,
  flattenSlugs,
  moderatorActionMetadataFacts,
} from './metadata-facts.mts'

describe('moderator action metadata guards', () => {
  it('rejects empty text, bad lists, and incomplete restrictions', () => {
    expect(() => moderatorActionMetadataFacts({ reason: '' })).toThrow('reason')
    expect(() => moderatorActionMetadataFacts({ topic_slugs: [1] })).toThrow('topic_slugs')
    expect(() => moderatorActionMetadataFacts({ restriction_id: 'restriction-1' })).toThrow(
      'restriction',
    )
  })

  it('flattens topic slugs and restrictions for child inserts', () => {
    const facts = moderatorActionMetadataFacts({
      topic_slugs: ['cards'],
      restriction_id: 'restriction-1',
      restriction_type: 'no_links',
    })
    expect(flattenSlugs([facts])).toMatchObject({
      ordinals: [1],
      positions: [0],
      values: ['cards'],
    })
    expect(flattenRestrictions([facts])).toMatchObject({
      ordinals: [1],
      ids: ['restriction-1'],
      types: ['no_links'],
    })
  })
})
