import { describe, expect, it } from 'vitest'
import { buildVoteScoreFilters } from './vote-score-filters.mts'
import { entityRelationMetadatum } from './metadata.mts'

const electionMetadata = entityRelationMetadatum.find(
  m => m.subject_type === 'post' && m.object_type === 'topic' && m.predicate === 'category',
)!

const nonElectionMetadata = entityRelationMetadatum.find(
  m => m.subject_type === 'topic' && m.object_type === 'topic' && m.predicate === 'parent',
)!

describe('buildVoteScoreFilters', () => {
  it('minNetVoteScore on non-election relation throws', () => {
    expect(() => buildVoteScoreFilters(nonElectionMetadata, { minNetVoteScore: 1 })).toThrow(
      /minNetVoteScore requires an election-enabled relation/,
    )
  })

  it('minNetVoteScore on election relation returns one filter', () => {
    const filters = buildVoteScoreFilters(electionMetadata, { minNetVoteScore: 1 })
    expect(filters).toHaveLength(1)
  })

  it('positiveNetVoteScore on non-election relation throws', () => {
    expect(() =>
      buildVoteScoreFilters(nonElectionMetadata, { positiveNetVoteScore: true }),
    ).toThrow(/positiveNetVoteScore requires an election-enabled relation/)
  })

  it('positiveNetVoteScore on election relation returns one filter', () => {
    const filters = buildVoteScoreFilters(electionMetadata, { positiveNetVoteScore: true })
    expect(filters).toHaveLength(1)
  })

  it('positiveNetVoteScore: false on election relation returns no filters', () => {
    const filters = buildVoteScoreFilters(electionMetadata, { positiveNetVoteScore: false })
    expect(filters).toHaveLength(0)
  })

  it('empty options returns no filters', () => {
    const filters = buildVoteScoreFilters(electionMetadata, {})
    expect(filters).toHaveLength(0)
  })

  it('minNetVoteScore: 0 on election relation returns one filter', () => {
    const filters = buildVoteScoreFilters(electionMetadata, { minNetVoteScore: 0 })
    expect(filters).toHaveLength(1)
  })

  it('both options set: skips positiveNetVoteScore clause when minNetVoteScore > 0', () => {
    const filters = buildVoteScoreFilters(electionMetadata, {
      minNetVoteScore: 5,
      positiveNetVoteScore: true,
    })
    expect(filters).toHaveLength(1)
  })

  it('both options set: includes positiveNetVoteScore clause when minNetVoteScore <= 0', () => {
    const filters = buildVoteScoreFilters(electionMetadata, {
      minNetVoteScore: 0,
      positiveNetVoteScore: true,
    })
    expect(filters).toHaveLength(2)
  })
})
