import { write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

type ToggleRow = { slug: string; enabled_at: Date | null; disabled_at: Date | null }

export async function getCurrentPostClassifierLabelToggles(
  communityId: string | null,
  query: QueryExecutor = write,
): Promise<ToggleRow[]> {
  if (communityId === null) return []
  const { rows } = await query<ToggleRow>(sql`/* getCurrentPostClassifierLabelToggles */
    SELECT moderator.slug, toggle.enabled_at, toggle.disabled_at
    FROM community_auto_tagger_agents toggle
    JOIN agents agent ON agent.id = toggle.agent_id
    JOIN agents__moderators moderator ON moderator.agent_id = agent.id
    WHERE toggle.community_id = ${communityId}
      AND agent.agent_type = 'moderator'
      AND agent.activated_at IS NOT NULL AND agent.deactivated_at IS NULL
      AND agent.deleted_at IS NULL
    FOR SHARE OF toggle, agent, moderator
  `)
  return rows
}

export async function getCurrentPostClassifierActorId(
  query: QueryExecutor = write,
): Promise<string> {
  const { rows } = await query<{ id: string }>(sql`/* getCurrentPostClassifierActorId */
    SELECT id FROM users WHERE username = 'post-classifier'
      AND is_system = TRUE AND deleted_at IS NULL
    FOR SHARE
  `)
  if (!rows[0]) throw new Error('post classifier system actor is missing')
  return rows[0].id
}

export async function getCurrentPostClassifierLocalTopicId(
  topicSlug: string,
  query: QueryExecutor = write,
): Promise<string> {
  const { rows } = await query<{ id: string }>(sql`/* getCurrentPostClassifierLocalTopicId */
    SELECT id FROM topics WHERE slug = ${topicSlug} AND topic_type = 'topic'
      AND deleted_at IS NULL AND merged_into_topic_id IS NULL
    FOR SHARE
  `)
  if (!rows[0]) throw new Error('post classifier local topic is missing or inactive')
  return rows[0].id
}

export type CurrentPostClassifierRemoteRow = {
  classifier_id: string
  prompt_version_id: string
  prompt: string
  model_name: string
  model_provider: 'openrouter' | 'typesafe'
  candidate_id: string
  topic_id: string
  topic_slug: string
  threshold_id: string
  lower: number
  upper: number
}

export async function getCurrentPostClassifierRemoteRows(
  topicSlugs: readonly string[],
  query: QueryExecutor = write,
): Promise<CurrentPostClassifierRemoteRow[]> {
  const { rows } = await query<CurrentPostClassifierRemoteRow>(sql`
    /* getCurrentPostClassifierRemoteRows */
    SELECT classifier.id AS classifier_id, prompt.id AS prompt_version_id,
      prompt.prompt, prompt.model_name, prompt.model_provider,
      candidate.id AS candidate_id, topic.id AS topic_id, topic.slug AS topic_slug,
      threshold.id AS threshold_id,
      COALESCE(threshold.lower_threshold_override, prompt.default_lower_threshold)::float8 AS lower,
      COALESCE(threshold.upper_threshold_override, prompt.default_upper_threshold)::float8 AS upper
    FROM classifiers classifier
    JOIN classifier_prompt_versions prompt ON prompt.classifier_id = classifier.id
      AND prompt.activated_at IS NOT NULL AND prompt.deactivated_at IS NULL
      AND prompt.deleted_at IS NULL
    JOIN classifier_candidates candidate ON candidate.classifier_id = classifier.id
      AND candidate.candidate_kind = 'topic' AND candidate.community_id IS NULL
      AND candidate.deleted_at IS NULL
    JOIN topics topic ON topic.id = candidate.topic_id
      AND topic.deleted_at IS NULL AND topic.merged_into_topic_id IS NULL
    JOIN classifier_candidate_thresholds threshold ON threshold.candidate_id = candidate.id
      AND threshold.prompt_version_id = prompt.id AND threshold.deactivated_at IS NULL
    WHERE classifier.slug = 'post-classifier'
      AND classifier.primitive = 'noul' AND classifier.candidate_kind = 'topic'
      AND classifier.activated_at IS NOT NULL AND classifier.deactivated_at IS NULL
      AND classifier.deleted_at IS NULL
      AND topic.slug = ANY(${[...topicSlugs]}::text[])
    FOR SHARE OF classifier, prompt, candidate, topic, threshold
  `)
  return rows
}
