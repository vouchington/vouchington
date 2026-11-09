import { beginTransaction, write } from '@data-stores/psql'

/** One owned row for each non-reference live policy; the topic's hostname supplies references. */
export async function seedTopicMergeLifecycleGroups(input: {
  sourceId: string
  userId: string
  alias: string
}): Promise<string> {
  await using query = await beginTransaction()
  await query(
    `/* seedTopicMergeLifecycleGroups */
    WITH alias AS (
      INSERT INTO topic_aliases (topic_id, alias) VALUES ($1::uuid, $3)
    ), follow AS (
      INSERT INTO relation__user__follow__topic (subject_id, object_id)
      VALUES ($2::uuid, $1::uuid)
    ), subtype AS (
      INSERT INTO spending_category_topics (topic_id) VALUES ($1::uuid)
    ), classifier AS (
      INSERT INTO classifiers (slug, primitive, candidate_kind, created_by_id)
      VALUES ('merge-reference-lifecycle-' || $1::uuid::text, 'choice', 'topic', $2::uuid)
      RETURNING id
    )
    INSERT INTO classifier_candidates (classifier_id, candidate_kind, topic_id)
    SELECT id, 'topic', $1::uuid FROM classifier`,
    [input.sourceId, input.userId, input.alias],
  )
  await query.commit()
  return `merge-reference-lifecycle-${input.sourceId}`
}

/** The inactive classifier parent is outside the merge reference inventory and remains owned. */
export async function deleteTopicMergeLifecycleClassifier(slug: string): Promise<void> {
  await write(`/* deleteTopicMergeLifecycleClassifier */ DELETE FROM classifiers WHERE slug = $1`, [
    slug,
  ])
}
