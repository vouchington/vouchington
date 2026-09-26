import { SNAPSHOT_KEY_COLUMNS } from './concrete-key-columns.mts'
import type { TransactionQuery } from '@data-stores/psql'
import type { PublicationSnapshotKey } from './identity-source.mts'
import {
  retainPostPublicationKeys,
  type PostPublicationRetainedKey,
} from './retained-key-writes.mts'

/** Persists a source page and its disappearing-key retention before the owner checkpoints it. */
export async function persistPublicationSnapshotPage(
  query: TransactionQuery,
  snapshotId: string,
  dirtyWorkId: string,
  keys: readonly PublicationSnapshotKey[],
): Promise<void> {
  await insertSnapshotKeys(query, snapshotId, keys)
  await retainSnapshotPage(query, dirtyWorkId, keys)
}

export async function insertSnapshotKeys(
  query: TransactionQuery,
  snapshotId: string,
  keys: readonly PublicationSnapshotKey[],
): Promise<void> {
  if (!keys.length) return
  const columns = [...Object.values(SNAPSHOT_KEY_COLUMNS), 'day']
  await query(
    `/* insertPostPublicationIdentitySnapshotKeys */
    INSERT INTO post_publication_identity_snapshot_keys (snapshot_id, ${columns.join(', ')})
    SELECT $1, CASE WHEN key.kind = 'topic' THEN key.uuid_value::uuid END, CASE WHEN key.kind = 'author' THEN key.uuid_value::uuid END, CASE WHEN key.kind = 'author_username' THEN key.text_value END, CASE WHEN key.kind = 'community' THEN key.uuid_value::uuid END, CASE WHEN key.kind = 'community_slug' THEN key.text_value END, CASE WHEN key.kind = 'post_slug' THEN key.text_value END, CASE WHEN key.kind = 'rss_feed' THEN key.uuid_value::uuid END, key.post_type::post_types, key.day::date
    FROM UNNEST($2::text[], $3::text[], $4::text[], $5::text[], $6::text[]) AS key(kind, uuid_value, text_value, post_type, day)
    ORDER BY $1::uuid, CASE WHEN key.kind = 'topic' THEN key.uuid_value::uuid END, CASE WHEN key.kind = 'author' THEN key.uuid_value::uuid END, CASE WHEN key.kind = 'author_username' THEN key.text_value END, CASE WHEN key.kind = 'community' THEN key.uuid_value::uuid END, CASE WHEN key.kind = 'community_slug' THEN key.text_value END, CASE WHEN key.kind = 'post_slug' THEN key.text_value END, CASE WHEN key.kind = 'rss_feed' THEN key.uuid_value::uuid END, key.post_type::post_types, key.day::date
    ON CONFLICT (snapshot_id, ${columns.join(', ')}) DO NOTHING`,
    [
      snapshotId,
      keys.map(key => key.kind),
      keys.map(key => key.uuidValue),
      keys.map(key => key.textValue),
      keys.map(key => key.postType),
      keys.map(key => key.day),
    ],
  )
}

export async function retainSnapshotPage(
  query: TransactionQuery,
  dirtyWorkId: string,
  keys: readonly PublicationSnapshotKey[],
): Promise<void> {
  await retainPostPublicationKeys(query, dirtyWorkId, keys.map(toRetainedKey))
}

function toRetainedKey(key: PublicationSnapshotKey): PostPublicationRetainedKey {
  switch (key.kind) {
    case 'topic':
      return { kind: 'impact_topic', uuidValue: key.uuidValue! }
    case 'author':
      return { kind: 'identity_author', uuidValue: key.uuidValue! }
    case 'community':
      return { kind: 'identity_community', uuidValue: key.uuidValue! }
    case 'rss_feed':
      return { kind: 'identity_rss_feed', uuidValue: key.uuidValue! }
    case 'author_username':
      return { kind: 'identity_author_username', textValue: key.textValue! }
    case 'community_slug':
      return { kind: 'identity_community_slug', textValue: key.textValue! }
    case 'post_slug':
      return { kind: 'identity_post_slug', textValue: key.textValue! }
    case 'sitemap_target':
      return { kind: 'sitemap_target', postType: key.postType!, day: key.day! }
  }
}
