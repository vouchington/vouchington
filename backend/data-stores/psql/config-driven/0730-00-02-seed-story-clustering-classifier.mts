import { STORY_CLUSTERING_CLASSIFIER_SYSTEM_USERNAME } from '@voucha/types/entities/user-constants'
import { buildSystemUserUpsertSQL } from './utils/system-user-seed.mts'

const CLASSIFIER_SLUG = 'story-clustering-classifier'
const MODEL_NAME = 'typesafe/jev-1.13'
const MODEL_PROVIDER = 'openrouter'

/**
 * Choice-primitive selection is a single gate, not a Noul-style 3-zone upvote/downvote/neutral
 * split: the persisted `probability` for whichever criterion the decision binds must clear
 * `default_lower_threshold` (or the story-scoped `effective_lower_threshold`, which nothing
 * currently overrides) or the decision resolves to `none`. The structured-decisions module
 * validates that a Choice answer's `probabilities` sum to 1 across every criterion, including
 * the unbound `none` option (see backend/modules/structured-decisions/answer-decoder.mts) — so
 * with at most 6 criteria (5 candidates + `none`), a lower threshold above 0.5 makes it
 * mathematically impossible for two criteria to clear the gate at once: two probabilities each
 * >= 0.6500 would already sum to >= 1.3, more than the whole distribution. 0.6500 is picked to
 * mirror tagging's own "confident yes" gate as a defensible "confident enough to cluster" bar.
 *
 * `default_upper_threshold` has no Choice selection consumer anywhere in the codebase (grepped
 * across backend/agents/classifiers, backend/services/classifiers, backend/services/stories) --
 * it is schema-required (`lower < upper` CHECK) but functionally inert for this primitive, only
 * read back for storage/lineage plumbing. 0.9500 is chosen solely to satisfy that constraint.
 */
const DEFAULT_LOWER_THRESHOLD = '0.6500'
const DEFAULT_UPPER_THRESHOLD = '0.9500'

/**
 * Unlike tagging's Noul template (rendered once per candidate via `{{candidate}}`
 * substitution), a Choice question is asked once per decision: the candidates are the
 * `criteria` themselves, and `toClassifierQuestions` (backend/agents/classifiers/bindings.mts)
 * passes this prompt through verbatim as the question text alongside the criterion key list.
 * Per-candidate content -- the incoming item and every labeled candidate (existing stories via
 * their nearest representative item, or standalone RSS items) -- is rendered into the shared
 * decision `state` by backend/agents/story-clustering/choice-clustering.mts, not into this
 * template. There is deliberately no placeholder here to substitute.
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
 * plus the dedicated `story-clustering-classifier` system user recorded as
 * classifier_prompt_versions' created_by_id. This is a distinct namespace from the spend-ledger
 * agent slug `story-clustering` (recorded in `ai_usage_records.agent_slug`) -- one identifies the
 * classifier configuration row, the other identifies the spend attribution bucket.
 *
 * Structurally identical to 0635-00-02-seed-tagging-classifier.mts: the `classifiers` row is
 * inserted pre-activated (ON CONFLICT DO NOTHING is a plain INSERT, so the activation-lifecycle
 * trigger -- which only fires on UPDATE -- never runs here), and the prompt version follows the
 * same deactivate-if-differs / insert-and-activate-if-absent rotation via MD5(prompt) comparison.
 */
export default function generateSeedStoryClusteringClassifierSQL(): string {
  return `${buildSystemUserUpsertSQL(STORY_CLUSTERING_CLASSIFIER_SYSTEM_USERNAME)}

INSERT INTO classifiers (slug, primitive, candidate_kind, activated_at, created_by_id)
SELECT '${CLASSIFIER_SLUG}', 'choice', 'story', CURRENT_TIMESTAMP, u.id
FROM users u
WHERE u.username = '${STORY_CLUSTERING_CLASSIFIER_SYSTEM_USERNAME}' AND u.is_system = TRUE
ON CONFLICT (slug) DO NOTHING;

UPDATE classifier_prompt_versions
SET deactivated_at = CURRENT_TIMESTAMP
WHERE classifier_id = (SELECT id FROM classifiers WHERE slug = '${CLASSIFIER_SLUG}')
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
WHERE c.slug = '${CLASSIFIER_SLUG}'
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
