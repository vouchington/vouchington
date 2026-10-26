import { createHash } from 'node:crypto'

/** The unfurl service identifies its supported parent by this canonical program slug. */
export default function generateSeedAmexReferralProgramSQL(): string {
  const contentHash = createHash('sha256').update('Amex Referral Program\n\n').digest('hex')

  return `
-- The Amex all-cards parent is application invariant data, independent of sample CSV imports.
INSERT INTO topics (
  name, slug, topic_type, bedrock_nova_multimodal_v1_content_sha256, created_via
)
VALUES (
  'Amex Referral Program', 'amex-referral-program', 'referral_program',
  decode('${contentHash}', 'hex'), 'system'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  topic_type = EXCLUDED.topic_type,
  bedrock_nova_multimodal_v1_content_sha256 = EXCLUDED.bedrock_nova_multimodal_v1_content_sha256,
  deleted_at = NULL
WHERE topics.name IS DISTINCT FROM EXCLUDED.name
  OR topics.topic_type IS DISTINCT FROM EXCLUDED.topic_type
  OR topics.bedrock_nova_multimodal_v1_content_sha256 IS DISTINCT FROM EXCLUDED.bedrock_nova_multimodal_v1_content_sha256
  OR topics.deleted_at IS NOT NULL;

INSERT INTO referral_program_topics (topic_id)
SELECT id FROM topics WHERE slug = 'amex-referral-program'
ON CONFLICT (topic_id) DO UPDATE SET
  enabled_at = COALESCE(referral_program_topics.enabled_at, EXCLUDED.enabled_at),
  disabled_at = NULL
WHERE referral_program_topics.enabled_at IS NULL
  OR referral_program_topics.disabled_at IS NOT NULL;

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
`
}
