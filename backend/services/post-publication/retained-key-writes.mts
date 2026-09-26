import type { TransactionQuery } from '@data-stores/psql'
import { POST_PUBLICATION_DIRTY_WORK_KEY_BATCH_SIZE } from './constants.mts'
import { RETAINED_KEY_COLUMNS } from './concrete-key-columns.mts'
import { retainPublicationIdentityBridges } from './identity-bridges.mts'

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
  for (const family of ['post', 'community', 'rss_feed_item'] as const) {
    const ids = [
      ...new Set(
        keys.flatMap(key =>
          key.kind === `impact_${family}` && 'uuidValue' in key
            ? [key.uuidValue.toLowerCase()]
            : [],
        ),
      ),
    ].sort()
    for (
      let offset = 0;
      offset < ids.length;
      offset += POST_PUBLICATION_DIRTY_WORK_KEY_BATCH_SIZE
    ) {
      // oxlint-disable-next-line no-await-in-loop -- prepare the entire family before advancing to the next family.
      await retainPublicationIdentityBridges(
        query,
        family,
        ids.slice(offset, offset + POST_PUBLICATION_DIRTY_WORK_KEY_BATCH_SIZE),
      )
    }
  }
  const ordered = keys.toSorted(
    (a, b) => a.kind.localeCompare(b.kind) || keyValue(a).localeCompare(keyValue(b)),
  )
  for (
    let offset = 0;
    offset < ordered.length;
    offset += POST_PUBLICATION_DIRTY_WORK_KEY_BATCH_SIZE
  ) {
    const page = ordered.slice(offset, offset + POST_PUBLICATION_DIRTY_WORK_KEY_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- each concrete key page owns its bridge locks and insert atomically.
    await insertPostPublicationKeyBatch(query, dirtyWorkId, page)
  }
}
async function insertPostPublicationKeyBatch(
  query: TransactionQuery,
  dirtyWorkId: string,
  keys: readonly PostPublicationRetainedKey[],
): Promise<void> {
  const columns = [...Object.values(RETAINED_KEY_COLUMNS), 'day']
  await query(
    `/* retainPostPublicationDirtyWorkKeys */
    INSERT INTO post_publication_dirty_work_keys (dirty_work_id, ${columns.join(', ')})
    SELECT $1::uuid, CASE WHEN key.kind = 'impact_post' THEN key.uuid_value::uuid END, CASE WHEN key.kind = 'impact_community' THEN key.uuid_value::uuid END, CASE WHEN key.kind = 'impact_rss_feed_item' THEN key.uuid_value::uuid END, CASE WHEN key.kind = 'impact_topic' THEN key.uuid_value::uuid END, CASE WHEN key.kind = 'identity_author' THEN key.uuid_value::uuid END, CASE WHEN key.kind = 'identity_community' THEN key.uuid_value::uuid END, CASE WHEN key.kind = 'identity_rss_feed' THEN key.uuid_value::uuid END, CASE WHEN key.kind = 'identity_author_username' THEN key.text_value END, CASE WHEN key.kind = 'identity_post_slug' THEN key.text_value END, CASE WHEN key.kind = 'identity_community_slug' THEN key.text_value END, CASE WHEN key.kind = 'identity_topic_alias' THEN key.text_value END, key.post_type::post_types, key.day::date
    FROM UNNEST($2::text[], $3::text[], $4::text[], $5::text[], $6::text[]) AS key(kind, uuid_value, text_value, post_type, day)
    ORDER BY $1::uuid, CASE WHEN key.kind = 'impact_post' THEN key.uuid_value::uuid END, CASE WHEN key.kind = 'impact_community' THEN key.uuid_value::uuid END, CASE WHEN key.kind = 'impact_rss_feed_item' THEN key.uuid_value::uuid END, CASE WHEN key.kind = 'impact_topic' THEN key.uuid_value::uuid END, CASE WHEN key.kind = 'identity_author' THEN key.uuid_value::uuid END, CASE WHEN key.kind = 'identity_community' THEN key.uuid_value::uuid END, CASE WHEN key.kind = 'identity_rss_feed' THEN key.uuid_value::uuid END, CASE WHEN key.kind = 'identity_author_username' THEN key.text_value END, CASE WHEN key.kind = 'identity_post_slug' THEN key.text_value END, CASE WHEN key.kind = 'identity_community_slug' THEN key.text_value END, CASE WHEN key.kind = 'identity_topic_alias' THEN key.text_value END, key.post_type::post_types, key.day::date
    ON CONFLICT (dirty_work_id, ${columns.join(', ')}) DO NOTHING`,
    [
      dirtyWorkId,
      keys.map(key => key.kind),
      keys.map(key => ('uuidValue' in key ? key.uuidValue : null)),
      keys.map(key => ('textValue' in key ? key.textValue : null)),
      keys.map(key => ('postType' in key ? key.postType : null)),
      keys.map(key => ('day' in key ? key.day : null)),
    ],
  )
}
function keyValue(key: PostPublicationRetainedKey): string {
  if ('uuidValue' in key) return key.uuidValue.toLowerCase()
  if ('textValue' in key) return key.textValue
  return `${key.postType}:${key.day}`
}
