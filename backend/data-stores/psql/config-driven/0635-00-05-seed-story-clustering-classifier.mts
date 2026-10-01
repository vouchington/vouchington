import { STORY_CLUSTERING_CLASSIFIER_SLUG } from '@voucha/types/entities/story-clustering-classifier'
import { STORY_CLUSTERING_CLASSIFIER_SYSTEM_USERNAME } from '@voucha/types/entities/user-constants'
import { buildSystemUserUpsertSQL } from './utils/system-user-seed.mts'

const MODEL_NAME = 'typesafe/jev-1.13'
const MODEL_PROVIDER = 'openrouter'

/**
 * A Choice answer's `probabilities` sum to 1 across every criterion, including the unbound `none`
 * option, so with at most six criteria (five candidates plus `none`) a lower threshold above 0.5
 * makes it impossible for two bound criteria to clear it at once: two probabilities of at least
 * 0.65 would already total 1.3. 0.65 mirrors tagging's "confident yes" bar. The story-clustering
 * selection joins a candidate only when its probability reaches the row's own lower threshold,
 * and anything below it (like `none`, a malformed answer or a partial answer) joins nothing.
 *
 * The upper threshold has no Choice selection consumer: it is schema-required (`lower < upper`)
 * and only read back for result lineage, so 0.95 exists only to satisfy that constraint.
 */
const DEFAULT_LOWER_THRESHOLD = '0.6500'
const DEFAULT_UPPER_THRESHOLD = '0.9500'

/**
 * A Choice question is asked once per run, so unlike tagging's per-candidate Noul template this
 * prompt has no placeholder: the candidates are the question's criteria, and their labelled
 * content (the incoming item and each candidate story's or standalone item's nearest member) is
 * rendered into the shared decision state by the story-clustering agent.
 */
const PROMPT = `You are a news editor deciding whether an incoming article belongs to the same real-world news story as any of the labeled candidates described in the state above.

Rules:
- Only group articles about the SAME specific event, not just the same general topic
- Rumors, leaks, and speculation are NOT the same story as official announcements
- Product reviews are NOT the same story as product launches
- Follow-up developments (e.g. "aftermath", "reactions") CAN be the same story if they reference the same event
- Different incidents affecting different subjects are NOT the same story, even if they occur around the same time and share the same topic domain (e.g. a supply chain attack on library A and a data leak from tool B are separate stories)
- Articles about different products, companies, or projects are separate stories unless one directly references the other as the same event

Pick the single best-matching candidate's key, or the "none" key if the incoming article does not clearly belong to any of them. Be conservative: when genuinely unsure, prefer "none".`

/**
 * Seeds the global `story-clustering-classifier` Choice classifier and its only prompt version,
 * plus the dedicated `story-clustering-classifier` system user recorded as the prompt version's
 * created_by_id. The slug names the classifier configuration; spend attribution uses the separate
 * `story-clustering` billing workload.
 *
 * The `classifiers` row is inserted pre-activated (ON CONFLICT DO NOTHING is a plain INSERT, so the
 * activation-lifecycle trigger, which only fires on UPDATE, never runs here), and the prompt version
 * rotates like tagging's: deactivate the active version only when its content differs, then insert
 * and activate the current one when no matching active row exists.
 *
 * @public loaded by path by the config-driven migration runner
 */
export default function generateSeedStoryClusteringClassifierSQL(): string {
  return `${buildSystemUserUpsertSQL(STORY_CLUSTERING_CLASSIFIER_SYSTEM_USERNAME)}

INSERT INTO classifiers (slug, primitive, candidate_kind, activated_at, created_by_id)
SELECT '${STORY_CLUSTERING_CLASSIFIER_SLUG}', 'choice', 'story', CURRENT_TIMESTAMP, u.id
FROM users u
WHERE u.username = '${STORY_CLUSTERING_CLASSIFIER_SYSTEM_USERNAME}' AND u.is_system = TRUE
ON CONFLICT (slug) DO NOTHING;

UPDATE classifier_prompt_versions
SET deactivated_at = CURRENT_TIMESTAMP
WHERE classifier_id = (SELECT id FROM classifiers WHERE slug = '${STORY_CLUSTERING_CLASSIFIER_SLUG}')
  AND activated_at IS NOT NULL
  AND deactivated_at IS NULL
  AND deleted_at IS NULL
  AND (
    MD5(prompt) != MD5($story_clustering_prompt$${PROMPT}$story_clustering_prompt$)
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
  c.id, $story_clustering_prompt$${PROMPT}$story_clustering_prompt$, '${MODEL_NAME}', '${MODEL_PROVIDER}',
  ${DEFAULT_LOWER_THRESHOLD}, ${DEFAULT_UPPER_THRESHOLD}, CURRENT_TIMESTAMP, u.id
FROM classifiers c
JOIN users u ON u.username = '${STORY_CLUSTERING_CLASSIFIER_SYSTEM_USERNAME}' AND u.is_system = TRUE
WHERE c.slug = '${STORY_CLUSTERING_CLASSIFIER_SLUG}'
AND NOT EXISTS (
  SELECT 1 FROM classifier_prompt_versions pv
  WHERE pv.classifier_id = c.id
    AND pv.activated_at IS NOT NULL
    AND pv.deactivated_at IS NULL
    AND pv.deleted_at IS NULL
    AND MD5(pv.prompt) = MD5($story_clustering_prompt$${PROMPT}$story_clustering_prompt$)
    AND pv.model_name = '${MODEL_NAME}'
    AND pv.model_provider = '${MODEL_PROVIDER}'
    AND pv.default_lower_threshold = ${DEFAULT_LOWER_THRESHOLD}
    AND pv.default_upper_threshold = ${DEFAULT_UPPER_THRESHOLD}
);`
}
