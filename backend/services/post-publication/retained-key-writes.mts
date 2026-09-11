import type { TransactionQuery } from '@data-stores/psql'
import { POST_PUBLICATION_DIRTY_WORK_KEY_BATCH_SIZE } from './constants.mts'

export const POST_PUBLICATION_DIRTY_WORK_KEY_KINDS = [
  'impact_post',
  'impact_topic',
  'impact_community',
  'impact_rss_feed_item',
  'identity_author',
  'identity_author_username',
  'identity_community',
  'identity_rss_feed',
  'identity_post_slug',
  'identity_community_slug',
  'identity_topic_alias',
  'sitemap_target',
] as const
export type PostPublicationDirtyWorkKeyKind = (typeof POST_PUBLICATION_DIRTY_WORK_KEY_KINDS)[number]
export type UuidKeyKind = Exclude<
  PostPublicationDirtyWorkKeyKind,
  | 'identity_author_username'
  | 'identity_post_slug'
  | 'identity_community_slug'
  | 'identity_topic_alias'
  | 'sitemap_target'
>
export type PostPublicationRetainedKey =
  | { kind: UuidKeyKind; uuidValue: string }
  | {
      kind:
        | 'identity_author_username'
        | 'identity_post_slug'
        | 'identity_community_slug'
        | 'identity_topic_alias'
      textValue: string
    }
  | { kind: 'sitemap_target'; postType: string; day: string }

export async function retainPostPublicationKeys(
  query: TransactionQuery,
  dirtyWorkId: string,
  keys: readonly PostPublicationRetainedKey[],
): Promise<void> {
  if (keys.length === 0) return
  for (const family of partitionRetainedKeys(keys)) {
    // oxlint-disable-next-line no-await-in-loop -- UUID, text, then sitemap locks are one global order.
    const orderedFamily = await orderRetainedKeyFamily(query, family)
    for (
      let offset = 0;
      offset < orderedFamily.length;
      offset += POST_PUBLICATION_DIRTY_WORK_KEY_BATCH_SIZE
    ) {
      // oxlint-disable-next-line no-await-in-loop -- each durable retained-key write is bounded.
      await insertPostPublicationKeyBatch(
        query,
        dirtyWorkId,
        orderedFamily.slice(offset, offset + POST_PUBLICATION_DIRTY_WORK_KEY_BATCH_SIZE),
      )
    }
  }
}

async function insertPostPublicationKeyBatch(
  query: TransactionQuery,
  dirtyWorkId: string,
  keys: readonly PostPublicationRetainedKey[],
): Promise<void> {
  const family = retainedKeyFamily(keys[0]!)
  const conflictTarget =
    family === 'uuid'
      ? '(dirty_work_id, kind, uuid_value) WHERE uuid_value IS NOT NULL'
      : family === 'text'
        ? '(dirty_work_id, kind, text_value) WHERE text_value IS NOT NULL'
        : '(dirty_work_id, kind, post_type, day) WHERE post_type IS NOT NULL'
  const sourceOrder =
    family === 'uuid'
      ? '$1::uuid, key.kind, key.uuid_value::uuid'
      : family === 'text'
        ? '$1::uuid, key.kind, key.text_value'
        : '$1::uuid, key.kind, key.post_type::post_types, key.day::date'
  await query(
    `/* retainPostPublicationDirtyWorkKeys */
    INSERT INTO post_publication_dirty_work_keys (dirty_work_id, kind, uuid_value, text_value, post_type, day)
    SELECT $1::uuid, key.kind, key.uuid_value::uuid, key.text_value, key.post_type::post_types, key.day::date
    FROM UNNEST($2::text[], $3::text[], $4::text[], $5::text[], $6::text[]) AS key(kind, uuid_value, text_value, post_type, day)
    ORDER BY ${sourceOrder}
    ON CONFLICT ${conflictTarget} DO NOTHING`,
    keyValues(dirtyWorkId, keys),
  )
}

function partitionRetainedKeys(
  keys: readonly PostPublicationRetainedKey[],
): PostPublicationRetainedKey[][] {
  const uuid: PostPublicationRetainedKey[] = []
  const text: PostPublicationRetainedKey[] = []
  const sitemap: PostPublicationRetainedKey[] = []
  for (const key of keys) {
    switch (retainedKeyFamily(key)) {
      case 'uuid':
        uuid.push(key)
        break
      case 'text':
        text.push(key)
        break
      case 'sitemap':
        sitemap.push(key)
        break
    }
  }
  return [uuid, text, sitemap].filter(family => family.length > 0)
}

function retainedKeyFamily(key: PostPublicationRetainedKey): 'uuid' | 'text' | 'sitemap' {
  if ('uuidValue' in key) return 'uuid'
  if ('textValue' in key) return 'text'
  return 'sitemap'
}

async function orderRetainedKeyFamily(
  query: TransactionQuery,
  keys: readonly PostPublicationRetainedKey[],
): Promise<PostPublicationRetainedKey[]> {
  const family = retainedKeyFamily(keys[0]!)
  const order =
    family === 'uuid'
      ? 'kind, uuid_value::uuid'
      : family === 'text'
        ? 'kind, text_value'
        : 'kind, post_type::post_types, day::date'
  const { rows } = await query<{
    kind: PostPublicationDirtyWorkKeyKind
    uuid_value: string | null
    text_value: string | null
    post_type: string | null
    day: string | null
  }>(
    `/* orderPostPublicationRetainedKeyFamily */
    SELECT kind, uuid_value, text_value, post_type, day
    FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[]) AS key(kind, uuid_value, text_value, post_type, day)
    ORDER BY ${order}`,
    keyValues(undefined, keys).slice(1),
  )
  return rows.map(row => {
    if (family === 'uuid') return { kind: row.kind as UuidKeyKind, uuidValue: row.uuid_value! }
    if (family === 'text')
      return {
        kind: row.kind as Extract<PostPublicationRetainedKey, { textValue: string }>['kind'],
        textValue: row.text_value!,
      }
    return { kind: 'sitemap_target', postType: row.post_type!, day: row.day! }
  })
}

function keyValues(
  dirtyWorkId: string | undefined,
  keys: readonly PostPublicationRetainedKey[],
): unknown[] {
  return [
    dirtyWorkId,
    keys.map(key => key.kind),
    keys.map(key => ('uuidValue' in key ? key.uuidValue : null)),
    keys.map(key => ('textValue' in key ? key.textValue : null)),
    keys.map(key => ('postType' in key ? key.postType : null)),
    keys.map(key => ('day' in key ? key.day : null)),
  ]
}
