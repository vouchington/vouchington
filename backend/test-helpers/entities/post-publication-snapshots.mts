import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { insertTestTopicBatch } from './topics/core.mts'
import { insertTestUrlDirect } from './urls.mts'
import { insertTestStory, setTestItemStoryId } from './stories.mts'
import { insertTestRssFeedItem } from './rss-feed-items.mts'
import { writeTestPostPublicationProtocol as writePostPublicationProtocol } from '../data-stores/psql/post-publication-protocol.mts'
import type { PublicationProjectionIdentity } from '../../services/post-publication/projection-identity.mts'
export async function insertTestPublicationTopicSlugFanout(
  postId: string,
  authorId: string,
  count: number,
): Promise<{ topicIds: string[]; slugs: string[] }> {
  const prefix = `publication-${postId}`
  const topicIds = await insertTestTopicBatch({ count, createdById: authorId, prefix })
  const slugs = Array.from(
    { length: count },
    (_, index) => `${prefix}-${index.toString().padStart(6, '0')}`,
  )
  await using query = await beginTransaction()
  await query(sql`/* insertTestPublicationTopicFanout */ INSERT INTO post_data_point_topics (post_id, topic_id)
    SELECT ${postId}, id FROM UNNEST(${topicIds}::uuid[]) AS topic(id)`)
  await query(sql`/* insertTestPublicationSlugFanout */ INSERT INTO post_slugs (post_id, slug)
    SELECT ${postId}, slug FROM UNNEST(${slugs}::text[]) AS source(slug)`)
  await query.commit()
  return { topicIds, slugs }
}
export async function seedTestPublicationReceipt(
  postId: string,
  fingerprint: string,
  identity: PublicationProjectionIdentity,
  snapshotId?: string,
): Promise<void> {
  await writePostPublicationProtocol(sql`/* seedTestPublicationReceipt */
    INSERT INTO post_publication_projection_receipts (post_id, eligibility_fingerprint, applied_generation, applied_identity, applied_snapshot_id)
    VALUES (${postId}, ${fingerprint}, 1, ${JSON.stringify(identity)}::jsonb, ${snapshotId ?? null})
    ON CONFLICT (post_id) DO UPDATE SET eligibility_fingerprint = EXCLUDED.eligibility_fingerprint,
      applied_identity = EXCLUDED.applied_identity, applied_snapshot_id = EXCLUDED.applied_snapshot_id`)
}
export async function readTestPublicationReceipt(
  postId: string,
): Promise<{ snapshotId: string | null; fingerprint: string } | undefined> {
  const { rows } = await write<{
    snapshotId: string | null
    fingerprint: string
  }>(sql`/* readTestPublicationReceipt */
    SELECT applied_snapshot_id AS "snapshotId", eligibility_fingerprint AS fingerprint FROM post_publication_projection_receipts WHERE post_id = ${postId}`)
  return rows[0]
}

export async function readTestPublicationRetainedKeys(
  workId: string,
): Promise<Array<{ kind: string; value: string }>> {
  const { rows } = await write<{
    kind: string
    value: string
  }>(sql`/* readTestPublicationRetainedKeys */
    SELECT kind, COALESCE(uuid_value::text, text_value, post_type::text || ':' || day::text) AS value
    FROM post_publication_dirty_work_keys WHERE dirty_work_id = ${workId} ORDER BY kind, value`)
  return rows
}

export async function testPublicationProtocolBarrier(): Promise<{
  oldRejected: boolean
  deleteRejected: boolean
  receiptRejected: boolean
  checkpointRejected: boolean
  deactivationRejected: boolean
  expandedSucceeded: boolean
  captureSucceeded: boolean
}> {
  await using query = await beginTransaction()
  await query.client
    .query(`CREATE TEMP TABLE post_publication_identity_protocol (LIKE public.post_publication_identity_protocol INCLUDING DEFAULTS) ON COMMIT DROP;
    INSERT INTO post_publication_identity_protocol (singleton, protocol_version) VALUES (true, 'typed-v1');
    CREATE TRIGGER test_deactivation BEFORE UPDATE ON post_publication_identity_protocol FOR EACH ROW EXECUTE FUNCTION public.fn_guard_post_publication_protocol_deactivation();
    CREATE TEMP TABLE post_publication_projection_receipts (id integer) ON COMMIT DROP;
    CREATE TEMP TABLE post_publication_reconciliation_audit_checkpoints (id integer) ON COMMIT DROP;
    CREATE TRIGGER test_receipt BEFORE INSERT ON post_publication_projection_receipts FOR EACH ROW EXECUTE FUNCTION public.fn_require_post_publication_typed_protocol();
    CREATE TRIGGER test_checkpoint BEFORE INSERT ON post_publication_reconciliation_audit_checkpoints FOR EACH ROW EXECUTE FUNCTION public.fn_require_post_publication_typed_protocol();
    CREATE TEMP TABLE post_publication_dirty_work (id integer, generation bigint, cursor_post_id uuid) ON COMMIT DROP;
    CREATE TRIGGER test_protocol BEFORE INSERT OR UPDATE OR DELETE ON post_publication_dirty_work FOR EACH ROW EXECUTE FUNCTION public.fn_require_post_publication_typed_protocol();
    INSERT INTO post_publication_dirty_work VALUES (1, 1, NULL)`)
  await query(
    `/* clearTestPublicationProtocolMarker */ SELECT set_config('voucha.post_publication_protocol', '', true)`,
  )
  await query.client.query(`DO $$ BEGIN
    UPDATE post_publication_dirty_work SET cursor_post_id = uuidv7() WHERE id = 1;
    PERFORM set_config('voucha.test_old_worker_rejected', 'false', true);
    EXCEPTION WHEN raise_exception THEN
      PERFORM set_config('voucha.test_old_worker_rejected', 'true', true);
    END $$`)
  const { rows: rejected } = await query<{
    rejected: boolean
  }>(`/* readOldPublicationWorkerRejection */
    SELECT current_setting('voucha.test_old_worker_rejected')::boolean AS rejected`)
  const attempts = [
    'DELETE FROM post_publication_dirty_work WHERE id = 1',
    'INSERT INTO post_publication_projection_receipts VALUES (1)',
    'INSERT INTO post_publication_reconciliation_audit_checkpoints VALUES (1)',
    "UPDATE post_publication_identity_protocol SET protocol_version = 'legacy'",
  ]
  const rejections: boolean[] = []
  for (const attempt of attempts) {
    // no-mistakes: sequential-await -- each exception subtransaction checks one isolated guard.
    await query.client.query(
      `DO $$ BEGIN ${attempt}; PERFORM set_config('voucha.test_guard_rejected', 'false', true); EXCEPTION WHEN raise_exception THEN PERFORM set_config('voucha.test_guard_rejected', 'true', true); END $$`,
    )
    // no-mistakes: sequential-await -- observe the immediately preceding isolated guard.
    const { rows } = await query<{ rejected: boolean }>(
      `/* readPublicationGuardRejection */ SELECT current_setting('voucha.test_guard_rejected')::boolean AS rejected`,
    )
    rejections.push(rows[0]!.rejected)
  }
  const { rowCount: capture } = await query(
    `/* simulatePublicationCapture */ UPDATE post_publication_dirty_work SET generation = generation + 1 WHERE id = 1`,
  )
  await query(
    `/* markTestExpandedPublicationWorker */ SELECT set_config('voucha.post_publication_protocol', 'typed-v1', true)`,
  )
  const { rowCount: expanded } = await query(
    `/* simulateExpandedPublicationWorker */ UPDATE post_publication_dirty_work SET cursor_post_id = uuidv7() WHERE id = 1`,
  )
  return {
    oldRejected: rejected[0]!.rejected,
    deleteRejected: rejections[0]!,
    receiptRejected: rejections[1]!,
    checkpointRejected: rejections[2]!,
    deactivationRejected: rejections[3]!,
    expandedSucceeded: expanded === 1,
    captureSucceeded: capture === 1,
  }
}

export async function insertTestPublicationFeedFanout(
  postId: string,
  authorId: string,
  topicIds: string[],
): Promise<string[]> {
  const url = await insertTestUrlDirect(authorId, `https://publication-${postId}.example.com/item`)
  if (!url) throw new Error('Expected publication URL')
  const { rows } = await write<{ id: string }>(sql`/* insertTestPublicationFeedFanout */
    WITH source AS (SELECT topic_id, ordinal FROM UNNEST(${topicIds}::uuid[]) WITH ORDINALITY AS input(topic_id, ordinal)), urls_inserted AS (
      INSERT INTO urls (url, hostname_id, pathname, search_params)
      SELECT 'https://publication-' || ${postId}::text || '.example.com/feed-' || ordinal,
        ${url.hostname.id}, '/feed-' || ordinal, '{}'::jsonb FROM source RETURNING id, pathname)
    INSERT INTO rss_feeds (rss_feed_url_id, topic_id, title)
    SELECT urls_inserted.id, source.topic_id, 'Publication fixture feed' FROM urls_inserted
    JOIN source ON urls_inserted.pathname = '/feed-' || source.ordinal RETURNING id`)
  const feedIds = rows.map(row => row.id)
  const story = await insertTestStory()
  const itemId = await insertTestRssFeedItem({
    rssFeedId: feedIds[0]!,
    urlId: url.id,
    guid: `publication-${postId}`,
    itemData: {},
    contentSha256: Buffer.alloc(32),
  })
  await setTestItemStoryId(itemId, story.id)
  await using query = await beginTransaction()
  await query(
    sql`/* attachTestPublicationStory */ INSERT INTO post__stories (post_id, story_id, initiated_by_id) VALUES (${postId}, ${story.id}, ${authorId})`,
  )
  await query(sql`/* attachTestPublicationFeedSources */ INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id)
    SELECT feed_id, ${itemId} FROM UNNEST(${feedIds}::uuid[]) AS source(feed_id) ON CONFLICT DO NOTHING`)
  await query.commit()
  return feedIds
}

export async function readTestPublicationSnapshot(snapshotId: string): Promise<{
  completed: boolean
  abandoned: boolean
  keys: Array<{ kind: string; value: string }>
}> {
  const { rows } = await write<{
    completed: boolean
    abandoned: boolean
    kind: string | null
    value: string | null
  }>(sql`/* readTestPublicationSnapshot */
    SELECT snapshot.completed_at IS NOT NULL AS completed, snapshot.abandoned_at IS NOT NULL AS abandoned,
      key.kind, COALESCE(key.uuid_value::text, key.text_value, key.post_type::text || ':' || key.day::text) AS value
    FROM post_publication_identity_snapshots snapshot LEFT JOIN post_publication_identity_snapshot_keys key ON key.snapshot_id = snapshot.id
    WHERE snapshot.id = ${snapshotId} ORDER BY key.kind, value`)
  if (!rows[0]) throw new Error('Expected test snapshot')
  return {
    completed: rows[0].completed,
    abandoned: rows[0].abandoned,
    keys: rows.flatMap(row =>
      row.kind && row.value ? [{ kind: row.kind, value: row.value }] : [],
    ),
  }
}

export async function hasTestPublicationSnapshot(snapshotId: string): Promise<boolean> {
  const { rows } = await write<{ exists: boolean }>(sql`/* hasTestPublicationSnapshot */
    SELECT EXISTS (SELECT 1 FROM post_publication_identity_snapshots WHERE id = ${snapshotId}) AS exists`)
  return rows[0]?.exists ?? false
}
