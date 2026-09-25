import { AUTOTAGGER_CLASSIFIER_SYSTEM_USERNAME } from '@voucha/types/entities/user-constants'
import { buildSystemUserUpsertSQL } from './utils/system-user-seed.mts'

const CLASSIFIER_SLUG = 'tagging'
const MODEL_NAME = 'typesafe/jev-1.13'
const MODEL_PROVIDER = 'openrouter'
const DEFAULT_LOWER_THRESHOLD = '0.1500'
const DEFAULT_UPPER_THRESHOLD = '0.6500'

/**
 * Rendered per candidate topic by substituting this placeholder with the topic's
 * sanitized display name (see backend/agents/classifiers/safe-content.mts). Kept
 * as a plain literal (not an exported constant) because a config-driven generator
 * has no runtime counterpart to stay in sync with; the C6 dispatch code that
 * renders this template asserts the placeholder is present before substituting.
 */
const CANDIDATE_PLACEHOLDER = '{{candidate}}'

const PROMPT = `Does the content above genuinely discuss "${CANDIDATE_PLACEHOLDER}" as a substantive subject, not just a passing mention or incidental keyword overlap?`

/**
 * Seeds the global `tagging` Noul classifier and its only prompt version, plus the
 * dedicated `autotagger-classifier` system user recorded as classifier_prompt_versions'
 * created_by_id. This user is distinct from the legacy 'autotagger' username (which keeps
 * its own `agents` row for C7) and intentionally gets no `agents` row of its own: C6 reads
 * classifier configuration directly, not through the retired agent-prompt framework.
 *
 * The `classifiers` row is inserted pre-activated (ON CONFLICT DO NOTHING is a plain INSERT,
 * so the activation-lifecycle trigger — which only fires on UPDATE — never runs here). The
 * prompt version follows the moderator-prompt rotation pattern: deactivate the active version
 * only when its content differs from the current config (never touching activated_at, which
 * the lifecycle trigger forbids resetting), then insert-and-activate the current version when
 * no matching active row already exists.
 */
export default function generateSeedTaggingClassifierSQL(): string {
  return `${buildSystemUserUpsertSQL(AUTOTAGGER_CLASSIFIER_SYSTEM_USERNAME)}

INSERT INTO classifiers (slug, primitive, candidate_kind, activated_at, created_by_id)
SELECT '${CLASSIFIER_SLUG}', 'noul', 'topic', CURRENT_TIMESTAMP, u.id
FROM users u
WHERE u.username = '${AUTOTAGGER_CLASSIFIER_SYSTEM_USERNAME}' AND u.is_system = TRUE
ON CONFLICT (slug) DO NOTHING;

UPDATE classifier_prompt_versions
SET deactivated_at = CURRENT_TIMESTAMP
WHERE classifier_id = (SELECT id FROM classifiers WHERE slug = '${CLASSIFIER_SLUG}')
  AND activated_at IS NOT NULL
  AND deactivated_at IS NULL
  AND deleted_at IS NULL
  AND (
    MD5(prompt) != MD5($tagging_prompt$${PROMPT}$tagging_prompt$)
    OR model_name != '${MODEL_NAME}'
    OR model_provider != '${MODEL_PROVIDER}'
    OR default_lower_threshold != ${DEFAULT_LOWER_THRESHOLD}
    OR default_upper_threshold != ${DEFAULT_UPPER_THRESHOLD}
  );

INSERT INTO classifier_prompt_versions (
  classifier_id, prompt, model_name, model_provider,
  default_lower_threshold, default_upper_threshold, activated_at, created_by_id
)
SELECT
  c.id, $tagging_prompt$${PROMPT}$tagging_prompt$, '${MODEL_NAME}', '${MODEL_PROVIDER}',
  ${DEFAULT_LOWER_THRESHOLD}, ${DEFAULT_UPPER_THRESHOLD}, CURRENT_TIMESTAMP, u.id
FROM classifiers c
JOIN users u ON u.username = '${AUTOTAGGER_CLASSIFIER_SYSTEM_USERNAME}' AND u.is_system = TRUE
WHERE c.slug = '${CLASSIFIER_SLUG}'
AND NOT EXISTS (
  SELECT 1 FROM classifier_prompt_versions pv
  WHERE pv.classifier_id = c.id
    AND pv.activated_at IS NOT NULL
    AND pv.deactivated_at IS NULL
    AND pv.deleted_at IS NULL
    AND MD5(pv.prompt) = MD5($tagging_prompt$${PROMPT}$tagging_prompt$)
    AND pv.model_name = '${MODEL_NAME}'
    AND pv.model_provider = '${MODEL_PROVIDER}'
    AND pv.default_lower_threshold = ${DEFAULT_LOWER_THRESHOLD}
    AND pv.default_upper_threshold = ${DEFAULT_UPPER_THRESHOLD}
);`
}
