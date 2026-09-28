import { describe, expect, it } from 'vitest'
import { chunkRelationIds } from './vote-target-ids.mts'

describe('entity relation vote target IDs', () => {
  it('canonicalizes mixed-case UUIDs before deduplication and PostgreSQL byte ordering', () => {
    const early = '01a20000-0000-7000-8000-000000000001'
    const late = '01b20000-0000-7000-8000-000000000002'
    expect(chunkRelationIds([late.toUpperCase(), early, early.toUpperCase()])).toEqual([
      [early, late],
    ])
  })
})
