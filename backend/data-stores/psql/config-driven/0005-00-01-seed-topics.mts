import { createHash } from 'node:crypto'
import { USER_TAGS } from '@voucha/types/entities/user-tags'

type SeededTopic = {
  name: string
  slug: string
  options?: {
    aliases?: string[]
  }
}

export const SEEDED_TOPICS: ReadonlyArray<SeededTopic> = [
  ...USER_TAGS.map(tag => ({ name: tag.label, slug: tag.slug })),
  { name: 'Self-Promotion', slug: 'self-promotion' },
  { name: 'AI Generated', slug: 'ai-generated' },
  { name: 'Political', slug: 'political' },
  { name: 'Click Bait', slug: 'click-bait' },
  { name: 'Vague Post', slug: 'vague-post' },
  { name: 'Shit Post', slug: 'shit-post' },
  { name: 'Buying', slug: 'buying', options: { aliases: ['to buy'] } },
  { name: 'Selling', slug: 'selling', options: { aliases: ['for sale'] } },
  { name: 'Trade', slug: 'trade', options: { aliases: ['to trade', 'trading'] } },
  { name: 'For Hire', slug: 'for-hire' },
  { name: 'Hiring', slug: 'hiring' },
  { name: 'Voucha', slug: 'voucha' },
]

function textToSha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function topicContentHash(name: string, aliases: string[] = []): string {
  // Normalize aliases to lowercase before hashing to match how they are stored.
  const normalizedAliases = aliases.map(a => a.toLowerCase())
  const content = `${name}\n${normalizedAliases.join(' ')}\n`
  return textToSha256Hex(content)
}

function escapeSqlString(str: string): string {
  return str.replaceAll("'", "''")
}

export default function generateSeedTopicsSQL(): string {
  const parts: string[] = ['-- Seed fundamental topics']

  for (const topic of SEEDED_TOPICS) {
    const aliases = [...new Set([topic.slug, ...(topic.options?.aliases ?? [])])]
    const contentHash = topicContentHash(topic.name, aliases)
    const safeName = escapeSqlString(topic.name)
    const safeSlug = escapeSqlString(topic.slug)

    // Upsert topic using the same CTE pattern as upsertTopicOnce in services/topics/upsert.mts
    parts.push(`
WITH existing_topic AS (
  SELECT id
  FROM topics
  WHERE slug = '${safeSlug}' OR LOWER(name) = LOWER('${safeName}')
  ORDER BY CASE WHEN slug = '${safeSlug}' THEN 0 ELSE 1 END
  LIMIT 1
),
updated_topic AS (
  UPDATE topics
  SET
    deleted_at = NULL,
    name = '${safeName}',
    slug = '${safeSlug}',
    topic_type = 'topic',
    bedrock_nova_multimodal_v1_content_sha256 = decode('${contentHash}', 'hex')
  WHERE id = (SELECT id FROM existing_topic)
  RETURNING id
),
inserted_topic AS (
  INSERT INTO topics (name, slug, topic_type, bedrock_nova_multimodal_v1_content_sha256)
  SELECT '${safeName}', '${safeSlug}', 'topic', decode('${contentHash}', 'hex')
  WHERE NOT EXISTS (SELECT 1 FROM existing_topic)
  RETURNING id
)
SELECT id FROM updated_topic
UNION ALL
SELECT id FROM inserted_topic;`)

    // Insert aliases
    for (const alias of aliases) {
      const safeAlias = escapeSqlString(alias.toLowerCase())
      parts.push(`
INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, '${safeAlias}'
FROM topics t
WHERE t.slug = '${safeSlug}'
ON CONFLICT (alias) DO UPDATE
SET topic_id = EXCLUDED.topic_id
WHERE topic_aliases.topic_id IS NULL AND EXCLUDED.topic_id IS NOT NULL;`)
    }
    parts.push(`
UPDATE topics topic
SET aliases = COALESCE(
  (SELECT ARRAY_AGG(alias ORDER BY alias) FROM topic_aliases WHERE topic_id = topic.id),
  '{}'::TEXT[]
)
WHERE topic.slug = '${safeSlug}';`)
  }

  return parts.join('\n')
}
