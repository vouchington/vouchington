import { describe, expect, it } from 'vitest'
import { getEntityRelationMetadataOrThrow } from '@voucha/types/entities/entity-relations-metadata'

describe('getEntityRelationMetadataOrThrow', () => {
  it('throws when no relation matches the subject/predicate/object triple', () => {
    expect(() =>
      getEntityRelationMetadataOrThrow({
        subjectType: 'image',
        objectType: 'image',
        predicate: 'follow',
      }),
    ).toThrow('Missing entity relation metadata for image -> follow -> image')
  })
})
