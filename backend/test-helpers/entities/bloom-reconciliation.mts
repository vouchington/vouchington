import { randomUUID } from 'node:crypto'
import { v7 } from 'uuid'
import { beginTransaction } from '@data-stores/psql'

/** Source-owned clocks are inserted directly so mutable-row triggers remain active. */
export async function insertTestBloomRepairSources(userId: string, postId: string, msecs: number) {
  const suffix = randomUUID().replaceAll(/[0-9]/g, digit => String.fromCharCode(97 + Number(digit)))
  const inside = new Date(msecs)
  const outside = new Date(msecs - 86_400_000)
  const communityId = v7()
  const apiKeyId = v7()
  const aliasId = v7()
  const hostnameId = v7()
  const domain = `repair-${suffix}.example.com`
  const slug = `repair-${suffix}`
  await using transaction = await beginTransaction()
  await transaction(
    `/* insertTestBloomRepairSources */
    INSERT INTO communities (id, name, slug, created_by_id, created_via, updated_at)
    VALUES ($1, 'Repair fixture', $2, $3, 'system', $4), ($5, 'Old repair fixture', $6, $3, 'system', $7)`,
    [communityId, slug, userId, inside, v7(), `${slug}-old`, outside],
  )
  await transaction(
    `/* insertTestBloomRepairSources */
    INSERT INTO api_keys (id, user_id, prefix, key_hash, updated_at)
    VALUES ($1, $2, 'voucha_rss_test', sha256($3::bytea), $4)`,
    [apiKeyId, userId, suffix, inside],
  )
  await transaction(
    `/* insertTestBloomRepairSources */
    INSERT INTO topic_aliases (id, alias, updated_at) VALUES ($1, $2, $3)`,
    [aliasId, slug, inside],
  )
  await transaction(
    `/* insertTestBloomRepairSources */
    INSERT INTO post_slugs (post_id, slug, updated_at) VALUES ($1, $2, $3), ($1, $4, $3)`,
    [postId, slug, inside, `${slug}-second`],
  )
  await transaction(
    `/* insertTestBloomRepairSources */
    INSERT INTO url_hostnames (id, hostname, is_crawlable, updated_at) VALUES ($1, $2, false, $3)`,
    [hostnameId, domain, inside],
  )
  const { rows: sources } = await transaction<{ id: number }>(
    `/* insertTestBloomRepairSources */
    INSERT INTO domain_blocklist_sources (type, name, url)
    VALUES ('url', $1, 'https://repair.example.com/url'), ('email', $2, 'https://repair.example.com/email') RETURNING id`,
    [`repair-url-${suffix}`, `repair-email-${suffix}`],
  )
  await transaction(
    `/* insertTestBloomRepairSources */
    INSERT INTO blocklisted_domains (source_id, domain, updated_at)
    SELECT id, $2, $3 FROM unnest($1::bigint[]) id`,
    [sources.map(row => row.id), domain, inside],
  )
  const { rows: embeddings } = await transaction<{ hash: string }>(
    `/* insertTestBloomRepairSources */
    INSERT INTO bedrock_nova_multimodal_v1_embeddings (content_sha256, embedding, updated_at)
    VALUES (sha256($1::bytea), array_fill(0::real, ARRAY[1024])::vector, $2)
    RETURNING encode(content_sha256, 'hex') AS hash`,
    [suffix, inside],
  )
  await transaction.commit()
  return {
    communityId,
    apiKeyId,
    aliasId,
    hostnameId,
    domain,
    slug,
    embeddingHash: embeddings[0]!.hash,
    sourceIds: sources.map(row => String(row.id)),
  }
}
