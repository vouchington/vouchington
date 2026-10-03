import { COMMUNITY_MODERATION_CLASSIFIER_SLUG } from '@voucha/types/entities/community-moderation-classifier'
import { MODERATION_SYSTEM_USERNAME } from '@voucha/types/entities/user-constants'

const MODEL_NAME = 'typesafe/jev-1.13'
const MODEL_PROVIDER = 'openrouter'
const DEFAULT_LOWER_THRESHOLD = '0.2500'
const DEFAULT_UPPER_THRESHOLD = '0.7500'

/**
 * Rendered once per community moderation prompt by substituting this placeholder with the
 * moderator's sanitized rule text (see backend/agents/classifiers/safe-content.mts). A plain
 * literal for the same reason as the tagging seed: a config-driven generator has no runtime
 * counterpart to stay in sync with, and the renderer asserts exactly one placeholder.
 */
const CANDIDATE_PLACEHOLDER = '{{candidate}}'

const PROMPT = `Does the content above clearly break this community rule? Answer yes only when the rule plainly applies to the content, not when it merely touches a related topic.\n\nCommunity rule: ${CANDIDATE_PLACEHOLDER}`

/**
 * Seeds the global `community-moderation` Noul classifier and its only prompt version, recorded
 * against the existing `automod` system user (created by the agents seed, which runs earlier).
 * The classifier has no stored candidates or per-candidate thresholds: each community
 * moderation prompt is its own candidate, and the prompt version's defaults are its thresholds.
 *
 * The `classifiers` row is inserted pre-activated, and the prompt version follows the same
 * rotation pattern as the tagging seed: deactivate the active version only when its content
 * differs, then insert-and-activate when no matching active row exists.
 *
 * @public loaded by path by the config-driven migration runner
 */
export default function generateSeedCommunityModerationClassifierSQL(): string {
  return `DO $community_moderation_actor$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE username = '${MODERATION_SYSTEM_USERNAME}' AND platform_account_kind = 'system'
  ) THEN
    RAISE EXCEPTION 'community moderation classifier seed requires the ${MODERATION_SYSTEM_USERNAME} system user';
  END IF;
END $community_moderation_actor$;

INSERT INTO classifiers (slug, primitive, candidate_kind, activated_at, created_by_id)
SELECT '${COMMUNITY_MODERATION_CLASSIFIER_SLUG}', 'noul', 'community_prompt', CURRENT_TIMESTAMP, u.id
FROM users u
WHERE u.username = '${MODERATION_SYSTEM_USERNAME}' AND u.platform_account_kind = 'system'
ON CONFLICT (slug) DO NOTHING;

UPDATE classifier_prompt_versions
SET deactivated_at = CURRENT_TIMESTAMP
WHERE classifier_id = (SELECT id FROM classifiers WHERE slug = '${COMMUNITY_MODERATION_CLASSIFIER_SLUG}')
  AND activated_at IS NOT NULL
  AND deactivated_at IS NULL
  AND deleted_at IS NULL
  AND (
    MD5(prompt) != MD5($community_moderation_prompt$${PROMPT}$community_moderation_prompt$)
    OR model_name != '${MODEL_NAME}'
    OR model_provider != '${MODEL_PROVIDER}'
    OR default_lower_threshold != ${DEFAULT_LOWER_THRESHOLD}
    OR default_upper_threshold != ${DEFAULT_UPPER_THRESHOLD}
  );

INSERT INTO classifier_prompt_versions (
  classifier_id, prompt, model_name, model_provider,
  default_lower_threshold, default_upper_threshold, activated_at, created_by_id
)
SELECT c.id, $community_moderation_prompt$${PROMPT}$community_moderation_prompt$,
  '${MODEL_NAME}', '${MODEL_PROVIDER}',
  ${DEFAULT_LOWER_THRESHOLD}, ${DEFAULT_UPPER_THRESHOLD}, CURRENT_TIMESTAMP, u.id
FROM classifiers c
JOIN users u ON u.username = '${MODERATION_SYSTEM_USERNAME}' AND u.platform_account_kind = 'system'
WHERE c.slug = '${COMMUNITY_MODERATION_CLASSIFIER_SLUG}'
  AND NOT EXISTS (
    SELECT 1 FROM classifier_prompt_versions pv
    WHERE pv.classifier_id = c.id
      AND pv.activated_at IS NOT NULL
      AND pv.deactivated_at IS NULL
      AND pv.deleted_at IS NULL
  );`
}
