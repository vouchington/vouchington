import { createHash } from 'node:crypto'
import { SEEDED_TOPICS } from './utils/seeded-topics.mts'

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

    // Upsert topic by slug or case-insensitive name
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
  INSERT INTO topics (name, slug, topic_type, bedrock_nova_multimodal_v1_content_sha256, created_via)
  SELECT '${safeName}', '${safeSlug}', 'topic', decode('${contentHash}', 'hex'), 'system'
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
  }

  // Unfurling recognizes this parent by its literal slug in every environment.
  const amexContentHash = topicContentHash('Amex Referral Program')
  parts.push(`
-- The Amex all-cards parent is application invariant data, independent of sample CSV imports.
-- Do not attempt an INSERT for an existing slug: its BEFORE INSERT identity trigger runs
-- even when ON CONFLICT would skip the update.
WITH existing AS (SELECT id FROM topics WHERE slug = 'amex-referral-program'),
updated AS (
  UPDATE topics SET
    name = 'Amex Referral Program',
    topic_type = 'referral_program',
    bedrock_nova_multimodal_v1_content_sha256 = decode('${amexContentHash}', 'hex'),
    deleted_at = NULL
  WHERE id = (SELECT id FROM existing)
    AND (name IS DISTINCT FROM 'Amex Referral Program'
      OR topic_type IS DISTINCT FROM 'referral_program'
      OR bedrock_nova_multimodal_v1_content_sha256 IS DISTINCT FROM decode('${amexContentHash}', 'hex')
      OR deleted_at IS NOT NULL)
  RETURNING id
),
inserted AS (
  INSERT INTO topics (name, slug, topic_type, bedrock_nova_multimodal_v1_content_sha256, created_via)
  SELECT 'Amex Referral Program', 'amex-referral-program', 'referral_program', decode('${amexContentHash}', 'hex'), 'system'
  WHERE NOT EXISTS (SELECT 1 FROM existing)
  RETURNING id
)
SELECT id FROM updated UNION ALL SELECT id FROM inserted;

UPDATE referral_program_topics SET
  enabled_at = COALESCE(enabled_at, CURRENT_TIMESTAMP),
  disabled_at = NULL
WHERE topic_id = (SELECT id FROM topics WHERE slug = 'amex-referral-program')
  AND (enabled_at IS NULL OR disabled_at IS NOT NULL);

INSERT INTO referral_program_topics (topic_id)
SELECT topic.id FROM topics topic
WHERE topic.slug = 'amex-referral-program'
  AND NOT EXISTS (SELECT 1 FROM referral_program_topics program WHERE program.topic_id = topic.id);

INSERT INTO referral_program_link_validation_rule_sets (slug, user_help_text)
VALUES ('amex_referral', 'Share your Amex referral link from your card account')
ON CONFLICT (slug) DO UPDATE SET user_help_text = EXCLUDED.user_help_text
WHERE referral_program_link_validation_rule_sets.user_help_text IS DISTINCT FROM EXCLUDED.user_help_text;

-- Deduplicate by the rule's natural identity on migration replay.
INSERT INTO referral_program_link_validation_rules (
  referral_program_link_validation_rule_set_id, hostname, pathname, example_urls
)
SELECT validation.id, '*.americanexpress.com', '/en-us/referral/all-cards%',
  ARRAY['https://www.americanexpress.com/en-us/referral/all-cards?ref=abc123']
FROM referral_program_link_validation_rule_sets validation
WHERE validation.slug = 'amex_referral'
  AND NOT EXISTS (
    SELECT 1 FROM referral_program_link_validation_rules rule
    WHERE rule.referral_program_link_validation_rule_set_id = validation.id
      AND rule.hostname = '*.americanexpress.com'
      AND rule.pathname = '/en-us/referral/all-cards%'
  );

INSERT INTO referral_program_topic_link_validation_rule_sets (
  referral_program_topic_id, referral_program_link_validation_rule_set_id
)
SELECT topic.id, validation.id
FROM topics topic CROSS JOIN referral_program_link_validation_rule_sets validation
WHERE topic.slug = 'amex-referral-program' AND validation.slug = 'amex_referral'
ON CONFLICT (referral_program_topic_id, referral_program_link_validation_rule_set_id) DO NOTHING;
`)

  return parts.join('\n')
}
