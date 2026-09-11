import { describe, expect, it } from 'vitest'
import { mergeEntityRelationPages } from './merge-entity-relations'
import type { EntityRelationsResponse } from './entity-relations'

const pageInfo = (cursor: string | null, hasNextPage: boolean) => ({
  start_cursor: null,
  end_cursor: cursor,
  has_next_page: hasNextPage,
})

describe('mergeEntityRelationPages', () => {
  it('merges relation records, elections, and votes across pages', () => {
    const first = {
      results: [{ id: 'relation-1', __entity_type: 'entity_relation' as const }],
      page_info: pageInfo('cursor-1', true),
      entity_relations: { 'relation-1': { created_at: '', created_by_id: '', object_data: {} } },
      election_votes: { 'relation-1': { choice: 'confirm' } },
    } satisfies EntityRelationsResponse
    const second = {
      results: [{ id: 'relation-2', __entity_type: 'entity_relation' as const }],
      page_info: pageInfo(null, false),
      entity_relations: { 'relation-2': { created_at: '', created_by_id: '', object_data: {} } },
      entity_relation_elections: {
        'relation-2': {
          __entity_type: 'entity_relation_election' as const,
          id: 'relation-2',
          votes_score_net: 1,
          votes_count_up: 1,
          votes_count_down: 0,
        },
      },
    } satisfies EntityRelationsResponse

    const merged = mergeEntityRelationPages([first, second])
    expect(merged.results.map(result => result.id)).toEqual(['relation-1', 'relation-2'])
    expect(Object.keys(merged.entity_relations)).toEqual(['relation-1', 'relation-2'])
    expect(merged.election_votes?.['relation-1']?.choice).toBe('confirm')
    expect(merged.entity_relation_elections?.['relation-2']?.votes_score_net).toBe(1)
  })
})
