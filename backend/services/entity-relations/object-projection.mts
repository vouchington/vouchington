import type { EntityRelationEntityType } from './config.mts'

/**
 * The fields each relation object type exposes as `object_data`. Reads list columns explicitly so
 * new or private columns (authorship, privacy, anonymity, embeddings, provenance) never reach a
 * response by default.
 */
export const entityRelationObjectColumns = {
  post: ['id', 'post_type', 'title', 'declared_language', 'lingua_rs_detected_language'],
  topic: ['id', 'topic_type', 'name', 'slug'],
  url: ['id', 'url', 'pathname'],
  url_hostname: ['id', 'hostname'],
  user: ['id', 'username'],
} as const satisfies Partial<Record<EntityRelationEntityType, readonly string[]>>

export type ProjectedEntityRelationObjectType = keyof typeof entityRelationObjectColumns

export function isProjectedEntityRelationObjectType(
  objectType: EntityRelationEntityType,
): objectType is ProjectedEntityRelationObjectType {
  return Object.hasOwn(entityRelationObjectColumns, objectType)
}

// The newest successful crawl's title and preview image; image_url is re-signed by the reader.
const LATEST_URL_CRAWL = `(
        SELECT json_build_object(
          'title', c.title,
          'image_url', coalesce(c.meta_tags->>'og:image', c.meta_tags->>'twitter:image')
        )
        FROM crawls c
        WHERE c.url_id = obj.id
          AND c.completed_at IS NOT NULL
          AND c.response_status_code = 200
          AND c.network_error IS NULL
        ORDER BY c.id DESC
        LIMIT 1
      )`

/** SQL text building `object_data` from the `obj` alias. Column names are fixed constants. */
export function buildEntityRelationObjectData(objectType: EntityRelationEntityType): string {
  if (!isProjectedEntityRelationObjectType(objectType)) {
    throw new Error(`Entity relation reads do not project ${objectType} objects`)
  }
  const fields: string[] = entityRelationObjectColumns[objectType].map(
    column => `'${column}', obj.${column}`,
  )
  if (objectType === 'url') fields.push(`'latest_crawl', ${LATEST_URL_CRAWL}`)
  return `json_build_object(${fields.join(', ')})`
}
