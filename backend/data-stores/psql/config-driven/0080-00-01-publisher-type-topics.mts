import { createHash } from 'node:crypto'

type PublisherTopic = {
  name: string
  slug: string
  aliases?: string[]
}

const PARENT: PublisherTopic = { name: 'Publisher Types', slug: 'publisher-types' }

const CHILDREN: PublisherTopic[] = [
  { name: 'Mainstream Media', slug: 'mainstream-media', aliases: ['MSM'] },
  {
    name: 'Public Media',
    slug: 'public-media',
    aliases: ['Public Broadcasting', 'Public Service Media', 'Public Broadcaster'],
  },
  { name: 'Corporate Media', slug: 'corporate-media', aliases: ['Corporate Press'] },
  { name: 'Blog', slug: 'blog', aliases: ['Personal Blog'] },
  { name: 'News Aggregator', slug: 'aggregator', aliases: ['Aggregator'] },
  { name: 'Forum', slug: 'forum', aliases: ['Discussion Forum'] },
  { name: 'UGC Platform', slug: 'ugc-platform', aliases: ['User-Generated Content'] },
  { name: 'Review', slug: 'review', aliases: ['Reviews Site'] },
]

function textToSha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function topicContentHash(name: string, aliases: string[] = []): string {
  const normalizedAliases = aliases.map(a => a.toLowerCase())
  const content = `${name}\n${normalizedAliases.join(' ')}\n`
  return textToSha256Hex(content)
}

function escapeSqlString(str: string): string {
  return str.replaceAll("'", "''")
}

function topicUpsertSQL(name: string, slug: string, aliases: string[] = []): string {
  const hash = topicContentHash(name, aliases)
  const safeName = escapeSqlString(name)
  const safeSlug = escapeSqlString(slug)
  return `
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
    bedrock_nova_multimodal_v1_content_sha256 = decode('${hash}', 'hex')
  WHERE id = (SELECT id FROM existing_topic)
  RETURNING id
),
inserted_topic AS (
  INSERT INTO topics (name, slug, topic_type, bedrock_nova_multimodal_v1_content_sha256)
  SELECT '${safeName}', '${safeSlug}', 'topic', decode('${hash}', 'hex')
  WHERE NOT EXISTS (SELECT 1 FROM existing_topic)
  RETURNING id
)
SELECT id FROM updated_topic
UNION ALL
SELECT id FROM inserted_topic;`
}

export default function generatePublisherTypeTopicsSQL(): string {
  const parts: string[] = ['-- Seed publisher type topics']
  const topics = [PARENT, ...CHILDREN]

  for (const topic of topics) {
    const aliases = [...new Set([topic.slug, ...(topic.aliases ?? [])])]
    parts.push(topicUpsertSQL(topic.name, topic.slug, aliases))

    for (const alias of aliases) {
      const safeAlias = escapeSqlString(alias.toLowerCase())
      const safeSlug = escapeSqlString(topic.slug)
      parts.push(`
INSERT INTO topic_aliases (topic_id, alias)
SELECT t.id, '${safeAlias}'
FROM topics t
WHERE t.slug = '${safeSlug}'
ON CONFLICT (alias) DO UPDATE
SET topic_id = EXCLUDED.topic_id
WHERE topic_aliases.topic_id IS NULL AND EXCLUDED.topic_id IS NOT NULL;`)
    }

    const safeSlug = escapeSqlString(topic.slug)
    parts.push(`
UPDATE topics topic
SET aliases = COALESCE(
  (SELECT ARRAY_AGG(alias ORDER BY alias) FROM topic_aliases WHERE topic_id = topic.id),
  '{}'::TEXT[]
)
WHERE topic.slug = '${safeSlug}';`)

    if (topic === PARENT) continue
    parts.push(`
INSERT INTO relation__topic__parent__topic (subject_id, object_id, created_by_id)
SELECT child.id, parent.id, (SELECT id FROM users WHERE username = 'system')
FROM topics child, topics parent
WHERE child.slug = '${safeSlug}' AND parent.slug = 'publisher-types'
ON CONFLICT (subject_id, object_id) DO NOTHING;`)
  }

  return parts.join('\n')
}
