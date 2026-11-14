import { describe, expect, it } from 'vitest'
import { checkPostPublicationReaderInventory } from './post-publication-reader-inventory.mts'
import {
  canonicalBuilder,
  inventoryPath,
  makeContext,
} from './post-publication-reader-inventory.test-support.mts'

describe('retired post-publication boundary classifications', () => {
  it.each(['public-boundary', 'direct-boundary', 'descendants-boundary', 'story-posts-boundary'])(
    'rejects retired %s classifications',
    classification => {
      const errors: string[] = []
      checkPostPublicationReaderInventory(
        makeContext({
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification }],
          pr2_baseline: [],
          classified_exceptions: [],
        }),
        errors,
      )
      expect(errors).toContain(
        `${inventoryPath}: implemented has invalid classification ${classification}`,
      )
    },
  )

  it('does not require a classification for an anonymous response boundary', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'direct-sql' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        {
          extra: ['backend/api/v1/posts/posts-routes/public-response.mts', 'return cachedPosts'],
        },
      ),
      errors,
    )
    expect(errors).toEqual([])
  })
})
