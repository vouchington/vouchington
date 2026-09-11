/**
 * Shared entity-relations API types.
 * Client mutation request functions live in ./client/entity-relations.
 */
export interface EntityRelation {
  id?: string
  subject_id?: string
  object_id?: string
  created_at: string
  created_by_id: string
  deleted_at?: string
  deleted_by_id?: string
  order_index?: number
  votes_count_up?: number
  votes_count_down?: number
  votes_score_net?: number
  votes_score_sort?: number
  object_data: Record<string, unknown>
}

export interface EntityRelationVote {
  choice: import('./client/elections').RelationChoice
}

export interface EntityRelationElection {
  __entity_type: 'entity_relation_election'
  id: string
  votes_score_net: number
  votes_count_up: number
  votes_count_down: number
}

export interface EntityRelationRef {
  __entity_type: 'entity_relation'
  id: string
}

export interface EntityRelationsResponse {
  results: EntityRelationRef[]
  page_info: {
    has_next_page: boolean
    end_cursor: string | null
    start_cursor: string | null
  }
  entity_relations: Record<string, EntityRelation>
  entity_relation_elections?: Record<string, EntityRelationElection>
  election_votes?: Record<string, EntityRelationVote>
}
