import { AUTOTAGGER_AGENT_SLUG } from '@voucha/types/entities/autotagger-agent'
import { AUTOTAGGER_AGENT_SYSTEM_USERNAME } from '@voucha/types/entities/user-constants'
import { buildSystemUserUpsertSQL } from './utils/system-user-seed.mts'

const MODEL_NAME = 'typesafe/jev-1.13'
const MODEL_PROVIDER = 'openrouter'

/**
 * Unlike tagging's "confident yes" bar this classifier only ever adds topics the first stage did not
 * apply, so it asks for a clearly higher probability before it tags (0.75) and treats anything at or
 * below 0.25 as a clear no. The scores in between are neutral and change nothing.
 */
const DEFAULT_LOWER_THRESHOLD = '0.2500'
const DEFAULT_UPPER_THRESHOLD = '0.7500'

/**
 * Rendered once per candidate topic by substituting this placeholder with the topic's sanitized
 * display name (see backend/agents/classifiers/safe-content.mts). A plain literal, not an exported
 * constant, because a config-driven generator has no runtime counterpart to stay in sync with; the
 * dispatch code that renders this template asserts the placeholder appears exactly once.
 */
const CANDIDATE_PLACEHOLDER = '{{candidate}}'

const PROMPT = `The state above holds the content and the topics that were already applied to it. Reason about what the content is substantively about, then answer: is "${CANDIDATE_PLACEHOLDER}" a subject the content genuinely addresses, directly or by clear implication, even when the topic is never named? A passing mention, incidental keyword overlap or a merely adjacent topic does not count, and a topic already applied is never an answer to add.`

/**
 * Seeds the global `autotagger-agent` Noul classifier and its only prompt version for the scoped
 * reasoning autotagger (C7). Its actor is the reserved `autotagger` system account (upserted by the
 * agent seed too, so the reclaim-then-upsert here is only an ordering guard), recorded as the
 * classifier's and the prompt version's created_by_id. Spend is attributed to the `autotagger-agent`
 * workload, never to C6's `autotagger`.
 *
 * The `classifiers` row is inserted pre-activated (ON CONFLICT DO NOTHING is a plain INSERT, so the
 * activation-lifecycle trigger, which only fires on UPDATE, never runs here) and the prompt version
 * rotates like tagging's: deactivate the active version only when its content differs, then insert
 * and activate the current one when no matching active row exists.
 *
 * @public loaded by path by the config-driven migration runner
 */
export default function generateSeedAutotaggerAgentClassifierSQL(): string {
  return `${buildSystemUserUpsertSQL(AUTOTAGGER_AGENT_SYSTEM_USERNAME)}

INSERT INTO classifiers (slug, primitive, candidate_kind, activated_at, created_by_id)
SELECT '${AUTOTAGGER_AGENT_SLUG}', 'noul', 'topic', CURRENT_TIMESTAMP, u.id
FROM users u
WHERE u.username = '${AUTOTAGGER_AGENT_SYSTEM_USERNAME}' AND u.is_system = TRUE
ON CONFLICT (slug) DO NOTHING;

UPDATE classifier_prompt_versions
SET deactivated_at = CURRENT_TIMESTAMP
WHERE classifier_id = (SELECT id FROM classifiers WHERE slug = '${AUTOTAGGER_AGENT_SLUG}')
  AND activated_at IS NOT NULL
  AND deactivated_at IS NULL
  AND deleted_at IS NULL
  AND (
    MD5(prompt) != MD5($autotagger_agent_prompt$${PROMPT}$autotagger_agent_prompt$)
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
  c.id, $autotagger_agent_prompt$${PROMPT}$autotagger_agent_prompt$, '${MODEL_NAME}', '${MODEL_PROVIDER}',
  ${DEFAULT_LOWER_THRESHOLD}, ${DEFAULT_UPPER_THRESHOLD}, CURRENT_TIMESTAMP, u.id
FROM classifiers c
JOIN users u ON u.username = '${AUTOTAGGER_AGENT_SYSTEM_USERNAME}' AND u.is_system = TRUE
WHERE c.slug = '${AUTOTAGGER_AGENT_SLUG}'
AND NOT EXISTS (
  SELECT 1 FROM classifier_prompt_versions pv
  WHERE pv.classifier_id = c.id
    AND pv.activated_at IS NOT NULL
    AND pv.deactivated_at IS NULL
    AND pv.deleted_at IS NULL
    AND MD5(pv.prompt) = MD5($autotagger_agent_prompt$${PROMPT}$autotagger_agent_prompt$)
    AND pv.model_name = '${MODEL_NAME}'
    AND pv.model_provider = '${MODEL_PROVIDER}'
    AND pv.default_lower_threshold = ${DEFAULT_LOWER_THRESHOLD}
    AND pv.default_upper_threshold = ${DEFAULT_UPPER_THRESHOLD}
);`
}
