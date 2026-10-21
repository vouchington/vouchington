import { entityRelationMetadatum } from '@services/entity-relations/metadata'

// The bookmark predicates an agent may set. The REST route accepts every bookmark predicate; the
// rest (hide, subscribe, dismiss_recommendation, proxy_follow, proxy_mute) stay REST-only.
export const BOOKMARK_TOOL_PREDICATES = ['save', 'follow', 'mute', 'block'] as const

const BOOKMARK_TOOL_RELATIONS = entityRelationMetadatum.filter(
  relation =>
    relation.subject_type === 'user' &&
    relation.is_bookmark &&
    (BOOKMARK_TOOL_PREDICATES as readonly string[]).includes(relation.predicate),
)

export const BOOKMARK_TOOL_ENTITY_TYPES = [
  ...new Set(BOOKMARK_TOOL_RELATIONS.map(relation => relation.object_type)),
]

export type BookmarkToolArgs = {
  entity_type: string
  entity_id: string
  predicate: string
}

const ENTITY_REFERENCE = { type: 'string' }

/** One bookmark relation. `remove_bookmark` still takes a single entity. */
export const BOOKMARK_TOOL_PARAMETERS = {
  type: 'object',
  properties: {
    entity_type: {
      type: 'string',
      enum: BOOKMARK_TOOL_ENTITY_TYPES,
      description: 'Entity type.',
    },
    entity_id: ENTITY_REFERENCE,
    predicate: {
      type: 'string',
      enum: BOOKMARK_TOOL_PREDICATES,
    },
  },
  required: ['entity_type', 'entity_id', 'predicate'],
  additionalProperties: false,
}
