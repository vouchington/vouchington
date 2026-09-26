import { storybookTopicSummary } from '@/storybook/design-system/autocomplete-fixtures'
import { storyMutationAt, storyText } from '@/storybook/mocks/story-mutation-bodies'

const emptyPage = { has_next_page: false, end_cursor: null, start_cursor: null }

let enabled = false
const relations = new Map<string, ReturnType<typeof relationRecord>>()

function relationRecord(objectId: string) {
  const id = `relation-${objectId}`
  return {
    id,
    created_at: storyMutationAt,
    created_by_id: null,
    object_id: objectId,
    object_data: storybookTopicSummary(objectId),
  }
}

export function setCategoryRelationsFixture(): void {
  enabled = true
  relations.clear()
}

export function clearCategoryRelationsFixture(): void {
  enabled = false
  relations.clear()
}

export function categoryRelationPost(body: unknown): unknown {
  const objectId = storyText(body, 'objectId') || 'topic-story'
  const relation = relationRecord(objectId)
  if (enabled) relations.set(objectId, relation)
  return { relation }
}

export function categoryRelationsResponse(endpoint: string): unknown | undefined {
  if (!enabled || !endpoint.startsWith('/api/v1/entity-relations/')) return undefined
  return {
    results: [...relations.values()].map(relation => ({
      __entity_type: 'entity_relation',
      id: relation.id,
    })),
    page_info: emptyPage,
    entity_relations: Object.fromEntries(
      [...relations.values()].map(relation => [relation.id, relation]),
    ),
  }
}
