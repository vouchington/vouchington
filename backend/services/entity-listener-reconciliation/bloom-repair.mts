import { addEntityBloomKeys } from '@services/entity-cache/bloom-filter-repair'
import { normalizeKey } from '@ts-shared/utils/strings'
import { Buffer } from 'node:buffer'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  repairEntityBloomKeys,
  repairPostSlugBloomKey,
} from '@services/entity-cache/repair-entity-keys'
import { addKeyHashToBloomFilter } from '@services/api-keys/bloom-filter'
import { addDomainsToBloomFilter } from '@services/urls-domains-blacklist/bloom-filter'
import { addDomainsToEmailBloomFilter } from '@services/urls-domains-blacklist/email-bloom-filter'
import { addEmbeddingHashesToBloomFilter } from '@services/bedrock-embeddings/bloom-filter/bloom-filter'
import type { EntityReconciliationCandidate } from './reconciliation.mts'

export async function repairReconciledBloomKeys(
  candidate: EntityReconciliationCandidate,
): Promise<void> {
  switch (candidate.entityType) {
    case 'topic_alias':
      return repairTopicAlias(candidate.entityId)
    case 'community':
      return repairEntityBloomKeys('communities', candidate.entityId)
    case 'rss_feed_item':
      return repairEntityBloomKeys('rss_feed_items', candidate.entityId)
    case 'post_slug':
      return repairPostSlugBloomKey(candidate.entityId, candidate.changeId!)
    case 'api_key':
      return repairApiKey(candidate.entityId)
    case 'blocklisted_domain':
      return repairBlocklistedDomain(candidate.entityId, candidate.changeId!)
    case 'embedding':
      return repairEmbedding(candidate.entityId)
    case 'url_hostname':
      return repairHostname(candidate.entityId)
  }
}

async function repairApiKey(id: string): Promise<void> {
  const { rows } = await read<{ key_hash: Buffer }>(
    sql`/* repairReconciledApiKeyBloom */ SELECT key_hash FROM api_keys WHERE id = ${id} AND revoked_at IS NULL`,
  )
  if (rows[0]) await addKeyHashToBloomFilter(rows[0].key_hash)
}

async function repairBlocklistedDomain(domain: string, sourceId: string): Promise<void> {
  const { rows } = await read<{ type: 'url' | 'email' }>(sql`/* repairReconciledBlocklistBloom */
    SELECT source.type FROM blocklisted_domains domain
    JOIN domain_blocklist_sources source ON source.id = domain.source_id
    WHERE domain.domain = ${domain} AND domain.source_id = ${sourceId}::bigint`)
  if (rows[0]?.type === 'url') await addDomainsToBloomFilter([domain])
  else if (rows[0]?.type === 'email') await addDomainsToEmailBloomFilter([domain])
}

async function repairEmbedding(hash: string): Promise<void> {
  const { rows } = await read(sql`/* repairReconciledEmbeddingBloom */
    SELECT 1 FROM bedrock_nova_multimodal_v1_embeddings WHERE content_sha256 = decode(${hash}, 'hex')`)
  if (rows.length > 0) await addEmbeddingHashesToBloomFilter([hash])
}

async function repairHostname(id: string): Promise<void> {
  const { rows } = await read<{ hostname: string }>(sql`/* repairReconciledHostnameBloom */
    SELECT hostname FROM url_hostnames WHERE id = ${id} AND (NOT is_crawlable OR is_blocked)`)
  if (rows[0]) await addDomainsToBloomFilter([rows[0].hostname])
}

async function repairTopicAlias(id: string): Promise<void> {
  const { rows } = await read<{ alias: string }>(
    sql`/* repairReconciledTopicAliasBloom */ SELECT alias FROM topic_aliases WHERE id = ${id}`,
  )
  if (rows[0]) await addEntityBloomKeys('topics', [normalizeKey(rows[0].alias)])
}
