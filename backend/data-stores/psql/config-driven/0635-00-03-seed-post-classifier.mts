import {
  POST_CLASSIFIER_MODEL_NAME,
  POST_CLASSIFIER_MODEL_PROVIDER,
  POST_CLASSIFIER_PROMPT,
  POST_CLASSIFIER_REMOTE_QUESTIONS,
  POST_CLASSIFIER_SLUG,
} from '@voucha/types/entities/post-classifier'
import { POST_CLASSIFIER_SYSTEM_USERNAME } from '@voucha/types/entities/user-constants'
import { buildSystemUserUpsertSQL } from './utils/system-user-seed.mts'

const LOWER = '0.2500'
const UPPER = '0.7500'
const topicSlugs = POST_CLASSIFIER_REMOTE_QUESTIONS.map(question => question.topicSlug)
const topicValues = topicSlugs.map(slug => `('${slug}')`).join(', ')

/** @public loaded by path by the config-driven migration runner */
export default function generateSeedPostClassifierSQL(): string {
  return `${buildSystemUserUpsertSQL(POST_CLASSIFIER_SYSTEM_USERNAME)}

DO $post_classifier_topics$ BEGIN
  IF (SELECT COUNT(*) FROM topics WHERE slug IN (${topicSlugs.map(slug => `'${slug}'`).join(', ')})
    AND topic_type = 'topic' AND deleted_at IS NULL AND merged_into_topic_id IS NULL)
    != ${topicSlugs.length} THEN
    RAISE EXCEPTION 'post classifier seed requires all canonical topics';
  END IF;
END $post_classifier_topics$;

INSERT INTO classifiers (slug, primitive, candidate_kind, activated_at, created_by_id)
SELECT '${POST_CLASSIFIER_SLUG}', 'noul', 'topic', CURRENT_TIMESTAMP, actor.id
FROM users actor
WHERE actor.username = '${POST_CLASSIFIER_SYSTEM_USERNAME}' AND actor.is_system = TRUE
ON CONFLICT (slug) DO NOTHING;

UPDATE classifier_prompt_versions
SET deactivated_at = CURRENT_TIMESTAMP
WHERE classifier_id = (SELECT id FROM classifiers WHERE slug = '${POST_CLASSIFIER_SLUG}')
  AND activated_at IS NOT NULL AND deactivated_at IS NULL AND deleted_at IS NULL
  AND (
    prompt != $post_classifier_prompt$${POST_CLASSIFIER_PROMPT}$post_classifier_prompt$
    OR model_name != '${POST_CLASSIFIER_MODEL_NAME}'
    OR model_provider != '${POST_CLASSIFIER_MODEL_PROVIDER}'
    OR default_lower_threshold != ${LOWER}
    OR default_upper_threshold != ${UPPER}
  );

INSERT INTO classifier_prompt_versions (
  classifier_id, prompt, model_name, model_provider,
  default_lower_threshold, default_upper_threshold, activated_at, created_by_id
)
SELECT classifier.id, $post_classifier_prompt$${POST_CLASSIFIER_PROMPT}$post_classifier_prompt$,
  '${POST_CLASSIFIER_MODEL_NAME}', '${POST_CLASSIFIER_MODEL_PROVIDER}',
  ${LOWER}, ${UPPER}, CURRENT_TIMESTAMP, actor.id
FROM classifiers classifier
JOIN users actor ON actor.username = '${POST_CLASSIFIER_SYSTEM_USERNAME}'
  AND actor.is_system = TRUE
WHERE classifier.slug = '${POST_CLASSIFIER_SLUG}'
  AND NOT EXISTS (
    SELECT 1 FROM classifier_prompt_versions prompt
    WHERE prompt.classifier_id = classifier.id
      AND prompt.activated_at IS NOT NULL AND prompt.deactivated_at IS NULL
      AND prompt.deleted_at IS NULL
  );

INSERT INTO classifier_candidates (
  classifier_id, candidate_kind, topic_id, created_by_id
)
SELECT classifier.id, 'topic', topic.id, actor.id
FROM classifiers classifier
JOIN users actor ON actor.username = '${POST_CLASSIFIER_SYSTEM_USERNAME}'
  AND actor.is_system = TRUE
JOIN (VALUES ${topicValues}) AS required(slug) ON TRUE
JOIN topics topic ON topic.slug = required.slug AND topic.topic_type = 'topic'
  AND topic.deleted_at IS NULL AND topic.merged_into_topic_id IS NULL
WHERE classifier.slug = '${POST_CLASSIFIER_SLUG}'
  AND NOT EXISTS (
    SELECT 1 FROM classifier_candidates candidate
    WHERE candidate.classifier_id = classifier.id AND candidate.topic_id = topic.id
      AND candidate.community_id IS NULL AND candidate.deleted_at IS NULL
  )
ON CONFLICT DO NOTHING;

INSERT INTO classifier_candidate_thresholds (
  classifier_id, candidate_id, prompt_version_id,
  lower_threshold_override, upper_threshold_override, created_by_id
)
SELECT classifier.id, candidate.id, prompt.id, ${LOWER}, ${UPPER}, actor.id
FROM classifiers classifier
JOIN classifier_prompt_versions prompt ON prompt.classifier_id = classifier.id
  AND prompt.activated_at IS NOT NULL AND prompt.deactivated_at IS NULL
  AND prompt.deleted_at IS NULL
JOIN classifier_candidates candidate ON candidate.classifier_id = classifier.id
  AND candidate.candidate_kind = 'topic' AND candidate.community_id IS NULL
  AND candidate.deleted_at IS NULL
JOIN topics topic ON topic.id = candidate.topic_id
  AND topic.slug IN (${topicSlugs.map(slug => `'${slug}'`).join(', ')})
  AND topic.deleted_at IS NULL AND topic.merged_into_topic_id IS NULL
JOIN users actor ON actor.username = '${POST_CLASSIFIER_SYSTEM_USERNAME}'
  AND actor.is_system = TRUE
WHERE classifier.slug = '${POST_CLASSIFIER_SLUG}'
  AND NOT EXISTS (
    SELECT 1 FROM classifier_candidate_thresholds threshold
    WHERE threshold.candidate_id = candidate.id AND threshold.prompt_version_id = prompt.id
      AND threshold.deactivated_at IS NULL
  )
ON CONFLICT DO NOTHING;`
}
