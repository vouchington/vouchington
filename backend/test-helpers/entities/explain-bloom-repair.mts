import { beginTransaction } from '@data-stores/psql'

/** Explicit source-clock fixtures belong in test helpers; update triggers remain enabled. */
export async function insertExplainBloomRepairSources(
  rows: { id: string; apiKeyId: string; aliasId: string; key: string; updated_at: string }[],
  owners: { userId: string; postId: string; hostnameId: string; urlId: string },
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    `/* insertExplainBloomRepairSources */
    INSERT INTO communities (id, name, slug, created_by_id, created_via, updated_at)
    SELECT id, key, key, $2::uuid, 'system', updated_at
    FROM jsonb_to_recordset($1::jsonb) fixture(id uuid, key text, updated_at timestamptz)
    ON CONFLICT DO NOTHING`,
    [JSON.stringify(rows), owners.userId],
  )
  await transaction(
    `/* insertExplainBloomRepairSources */
    INSERT INTO api_keys (id, user_id, prefix, key_hash, updated_at)
    SELECT id, $2::uuid, 'voucha_rss_test', sha256(key::bytea), updated_at
    FROM jsonb_to_recordset($1::jsonb) fixture(id uuid, key text, updated_at timestamptz)
    ON CONFLICT DO NOTHING`,
    [JSON.stringify(rows.map(row => ({ ...row, id: row.apiKeyId }))), owners.userId],
  )
  await transaction(
    `/* insertExplainBloomRepairSources */
    INSERT INTO bedrock_nova_multimodal_v1_embeddings (content_sha256, embedding, updated_at)
    SELECT sha256(key::bytea), array_fill(0::real, ARRAY[1024])::vector, updated_at
    FROM jsonb_to_recordset($1::jsonb) fixture(key text, updated_at timestamptz)
    ON CONFLICT DO NOTHING`,
    [JSON.stringify(rows)],
  )
  await transaction(
    `/* insertExplainBloomRepairSources */
    INSERT INTO topic_aliases (id, alias, updated_at)
    SELECT id, key, updated_at FROM jsonb_to_recordset($1::jsonb) fixture(id uuid, key text, updated_at timestamptz)
    ON CONFLICT DO NOTHING`,
    [JSON.stringify(rows.map(row => ({ ...row, id: row.aliasId })))],
  )
  await transaction(
    `/* insertExplainBloomRepairSources */
    INSERT INTO post_slugs (post_id, slug, updated_at)
    SELECT $2::uuid, key, updated_at FROM jsonb_to_recordset($1::jsonb) fixture(key text, updated_at timestamptz)
    ON CONFLICT DO NOTHING`,
    [JSON.stringify(rows), owners.postId],
  )
  await transaction(`/* insertExplainBloomRepairSources */
    INSERT INTO domain_blocklist_sources (type, name, url)
    VALUES ('url', 'seed-bloom-repair-url', 'https://seed-bloom-repair.example.com/url'),
      ('email', 'seed-bloom-repair-email', 'https://seed-bloom-repair.example.com/email')
    ON CONFLICT DO NOTHING`)
  await transaction(
    `/* insertExplainBloomRepairSources */
    INSERT INTO blocklisted_domains (source_id, domain, updated_at)
    SELECT source.id, fixture.key || '.example.com', fixture.updated_at
    FROM jsonb_to_recordset($1::jsonb) fixture(key text, updated_at timestamptz)
    CROSS JOIN domain_blocklist_sources source
    WHERE source.name IN ('seed-bloom-repair-url', 'seed-bloom-repair-email')
    ON CONFLICT DO NOTHING`,
    [JSON.stringify(rows)],
  )
  await transaction(
    `/* insertExplainBloomRepairSources */
    INSERT INTO rss_feed_item_guids (url_hostname_id, guid)
    SELECT $2::uuid, key FROM jsonb_to_recordset($1::jsonb) fixture(key text)
    ON CONFLICT DO NOTHING`,
    [JSON.stringify(rows), owners.hostnameId],
  )
  await transaction(
    `/* insertExplainBloomRepairSources */
    INSERT INTO rss_feed_items (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256, updated_at)
    SELECT identity.id, $3::uuid, jsonb_build_object('title', fixture.key), sha256(fixture.key::bytea), fixture.updated_at
    FROM jsonb_to_recordset($1::jsonb) fixture(key text, updated_at timestamptz)
    JOIN rss_feed_item_guids identity ON identity.url_hostname_id = $2::uuid AND identity.guid = fixture.key
    ON CONFLICT DO NOTHING`,
    [JSON.stringify(rows), owners.hostnameId, owners.urlId],
  )
  await transaction.commit()
}

export async function insertExplainHostnameFlagSources(
  rows: {
    id: string
    hostname: string
    crawlable: boolean
    updated_at: string
  }[],
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    `/* insertExplainHostnameFlagSources */ INSERT INTO url_hostnames (id, hostname, is_crawlable, updated_at)
    SELECT id, hostname, crawlable, updated_at FROM jsonb_to_recordset($1::jsonb)
      AS fixture(id uuid, hostname text, crawlable boolean, updated_at timestamptz) ON CONFLICT DO NOTHING`,
    [JSON.stringify(rows)],
  )
  await transaction.commit()
}
