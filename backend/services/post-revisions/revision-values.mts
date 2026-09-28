import type { QueryOptions } from '@data-stores/psql/types'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PostRevisionChanges } from './facts.mts'
import { asBoolean, asEnum, asIdList, asText, asTimestamp } from './data-point-facts.mts'

type FieldChange = { before: unknown; after: unknown }
type TextPair = { changed: boolean; before: string | null; after: string | null }
type BoolPair = { changed: boolean; before: boolean | null; after: boolean | null }
type TimePair = {
  changed: boolean
  before: Date | null
  after: Date | null
  beforeSentinel: string | null
  afterSentinel: string | null
}

export function textPair(changes: PostRevisionChanges, field: string): TextPair {
  const change = changes[field]
  if (!change) return { changed: false, before: null, after: null }
  return { changed: true, before: asText(change.before, field), after: asText(change.after, field) }
}

export function enumPair(
  changes: PostRevisionChanges,
  field: string,
  allowed: Set<string>,
): TextPair {
  const change = changes[field]
  if (!change) return { changed: false, before: null, after: null }
  return {
    changed: true,
    before: asEnum(change.before, field, allowed),
    after: asEnum(change.after, field, allowed),
  }
}

export function boolPair(changes: PostRevisionChanges, field: string): BoolPair {
  const change = changes[field]
  if (!change) return { changed: false, before: null, after: null }
  return {
    changed: true,
    before: asBoolean(change.before, field),
    after: asBoolean(change.after, field),
  }
}

export function timePair(changes: PostRevisionChanges, field: string): TimePair {
  const change = changes[field]
  if (!change)
    return { changed: false, before: null, after: null, beforeSentinel: null, afterSentinel: null }
  const before = asTimestamp(change.before, field)
  const after = asTimestamp(change.after, field)
  return {
    changed: true,
    before: before.at,
    after: after.at,
    beforeSentinel: before.sentinel,
    afterSentinel: after.sentinel,
  }
}

export async function insertStringIds(
  revisionId: string,
  table: 'post_revision_images' | 'post_revision_rating_topics',
  column: 'image_id' | 'topic_id',
  change: FieldChange | undefined,
  options: QueryOptions,
): Promise<void> {
  if (!change) return
  await insertSideIds(revisionId, table, column, 'before', asIdList(change.before, column), options)
  await insertSideIds(revisionId, table, column, 'after', asIdList(change.after, column), options)
}

export async function insertSideIds(
  revisionId: string,
  table: string,
  column: string,
  side: 'before' | 'after',
  ids: string[],
  options: QueryOptions,
): Promise<void> {
  if (ids.length === 0) return
  const insert = sql`/* createPostRevision:ids */
    INSERT INTO `
  insert.append(table)
  insert.append(sql` (revision_id, side, position, `)
  insert.append(column)
  insert.append(sql`)
    SELECT ${revisionId}::uuid, ${side}, item.position::integer, item.id::uuid
    FROM UNNEST(${ids}::uuid[], ${ids.map((_, index) => index)}::integer[]) AS item(id, position)`)
  await write(insert, options)
}

export async function insertCategories(
  revisionId: string,
  change: FieldChange | undefined,
  options: QueryOptions,
): Promise<void> {
  if (!change) return
  await insertCategorySide(revisionId, 'before', change.before, options)
  await insertCategorySide(revisionId, 'after', change.after, options)
}

async function insertCategorySide(
  revisionId: string,
  side: 'before' | 'after',
  value: unknown,
  options: QueryOptions,
): Promise<void> {
  const categories = categoryFacts(value)
  if (categories.length === 0) return
  await write(
    sql`/* createPostRevision:categories */
      INSERT INTO post_revision_categories (revision_id, side, position, topic_id, hashtag, topic_name)
      SELECT ${revisionId}::uuid, ${side}, item.position, item.topic_id, item.hashtag, item.topic_name
      FROM UNNEST(
        ${categories.map((_, index) => index)}::integer[],
        ${categories.map(category => category.topicId)}::uuid[],
        ${categories.map(category => category.hashtag)}::text[],
        ${categories.map(category => category.topicName)}::text[]
      ) AS item(position, topic_id, hashtag, topic_name)`,
    options,
  )
}

function categoryFacts(
  value: unknown,
): Array<{ topicId: string | null; hashtag: string | null; topicName: string | null }> {
  if (!Array.isArray(value)) throw new Error('Post revision categories must be an array')
  return value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Post revision category must be an object')
    }
    const category = item as {
      type?: unknown
      topic_id?: unknown
      hashtag?: unknown
      topic_name?: unknown
    }
    if (category.type === 'topic' && typeof category.topic_id === 'string') {
      return {
        topicId: category.topic_id,
        hashtag: null,
        topicName: typeof category.topic_name === 'string' ? category.topic_name : null,
      }
    }
    if (category.type === 'hashtag' && typeof category.hashtag === 'string') {
      return { topicId: null, hashtag: category.hashtag, topicName: null }
    }
    throw new Error('Post revision category must be a topic or hashtag')
  })
}
