import type { QueryOptions } from '@data-stores/psql/types'
import type {
  PublicContentProvenance,
  StaffContentProvenance,
} from '@voucha/types/entities/content-provenance'
import { isModerationStaff } from '@services/users/authorization'
import type { PrivateUser } from '@services/users/types'
import {
  getCommunityProvenanceFacts,
  getListProvenanceFacts,
  getRssFeedProvenanceFacts,
  getTopicProvenanceFacts,
} from './entity-facts.mts'
import type { ProvenanceFacts } from './provenance-facts.mts'
import {
  buildStaffProvenance,
  resolvePublicProvenanceLabel,
} from './resolve-public-provenance-label.mts'

type LabelableEntity = {
  id: string
  provenance?: PublicContentProvenance
  staff_provenance?: StaffContentProvenance
}

type GetFacts = (ids: string[], options: QueryOptions) => Promise<Map<string, ProvenanceFacts>>

/**
 * Builds the attach helper for one entity. The helper sets `provenance` (API and MCP rows only)
 * and, for moderation staff, `staff_provenance` on copies of the given entities, in one batched
 * read that runs after the cache read. The cached entities are never mutated, and entries the
 * facts query cannot find (and `null` or `undefined` entries) pass through unchanged.
 */
function createAttacher(getFacts: GetFacts) {
  return async function attach<T extends LabelableEntity | null | undefined>(
    entities: T[],
    currentUser?: PrivateUser | null,
    options: QueryOptions = {},
  ): Promise<T[]> {
    const facts = await getFacts(
      [...new Set(entities.flatMap(entity => (entity ? [entity.id] : [])))],
      options,
    )
    const staff = isModerationStaff(currentUser ?? null)
    return entities.map(entity => {
      const fact = entity ? facts.get(entity.id) : undefined
      if (!entity || !fact) return entity
      const provenance = resolvePublicProvenanceLabel(fact.created_via, fact.client)
      return {
        ...entity,
        ...(provenance && { provenance }),
        ...(staff && { staff_provenance: buildStaffProvenance(fact.created_via, fact.client) }),
      }
    })
  }
}

/**
 * Builds the helper for the entity a write route or tool returns right after it wrote it. It
 * reads the primary, because the row was committed an instant ago and a replica may not have it.
 * Run it on the response only, never on an entity that is stored.
 */
function createWrittenAttacher(attach: ReturnType<typeof createAttacher>) {
  return async function attachWritten<T extends LabelableEntity | null>(
    entity: T,
    viewer: PrivateUser | null,
  ): Promise<T> {
    return (await attach([entity], viewer, { readOnly: false }))[0] ?? entity
  }
}

export const attachCommunityProvenance = createAttacher(getCommunityProvenanceFacts)
export const attachTopicProvenance = createAttacher(getTopicProvenanceFacts)
export const attachListProvenance = createAttacher(getListProvenanceFacts)
export const attachRssFeedProvenance = createAttacher(getRssFeedProvenanceFacts)

export const attachWrittenCommunityProvenance = createWrittenAttacher(attachCommunityProvenance)
export const attachWrittenTopicProvenance = createWrittenAttacher(attachTopicProvenance)
export const attachWrittenListProvenance = createWrittenAttacher(attachListProvenance)
export const attachWrittenRssFeedProvenance = createWrittenAttacher(attachRssFeedProvenance)
