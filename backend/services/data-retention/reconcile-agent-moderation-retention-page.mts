import { write } from '@data-stores/psql'

type Candidate = { id: string; post_id: string }

export async function reconcileAgentModerationRetentionPage(pending: readonly Candidate[]) {
  // Keep the predecessor writes separate from the due transaction's source locks.
  // A source moves only to plain due; the next transaction decides whether it is a keeper.
  const { rows } = await write<{ id: string; was_newest: boolean }>(
    `/* reconcileAgentModerationRetentionPage */
     WITH sources AS (
       SELECT moderation.id, moderation.post_id, moderation.deleted_at,
         (
           SELECT CASE WHEN moderation.deleted_at IS NULL OR prior.deleted_at IS NOT NULL THEN prior.id END
           FROM agent_moderations prior
           WHERE prior.post_id = moderation.post_id AND prior.prompt_id = moderation.prompt_id
             AND prior.id < moderation.id
           ORDER BY prior.id DESC LIMIT 1
         ) AS previous_id,
         CASE WHEN moderation.deleted_at IS NULL THEN (
           SELECT prior.id FROM agent_moderations prior
           WHERE prior.post_id = moderation.post_id AND prior.prompt_id = moderation.prompt_id
             AND prior.id < moderation.id AND prior.deleted_at IS NULL
           ORDER BY prior.id DESC LIMIT 1
         ) END AS previous_live_id
       FROM unnest($1::uuid[], $2::uuid[]) AS page(id, post_id)
       CROSS JOIN LATERAL (
         SELECT id, post_id, prompt_id, deleted_at FROM agent_moderations
         WHERE id = page.id AND post_id = page.post_id AND retention_blocked_reason = 'reconcile'
         LIMIT 1
       ) AS moderation
     )
     MERGE INTO agent_moderations moderation
     USING (
       SELECT source.post_id, target.id,
              bool_or(target.settle) AS settle,
              bool_or(NOT target.settle) AS wake,
              min(source.deleted_at) FILTER (WHERE target.settle) AS deleted_at
       FROM sources source
       CROSS JOIN LATERAL (VALUES
         (source.id, true),
         (source.previous_id, false),
         (source.previous_live_id, false)
       ) AS target(id, settle)
       WHERE target.id IS NOT NULL
       GROUP BY source.post_id, target.id
       ORDER BY target.id, source.post_id
     ) AS target
     ON moderation.id = target.id AND moderation.post_id = target.post_id
     WHEN MATCHED AND target.settle
       AND moderation.retention_blocked_reason = 'reconcile'
       AND moderation.deleted_at IS NOT DISTINCT FROM target.deleted_at THEN
       UPDATE SET retention_blocked_reason = NULL
     WHEN MATCHED AND target.wake AND (
       moderation.retention_blocked_reason = 'newest' OR (
         moderation.retention_blocked_reason IS NULL AND moderation.retention_due_at IS NOT NULL
       )
     ) THEN
       UPDATE SET retention_due_at = uuid_extract_timestamp(moderation.id) + INTERVAL '90 days',
                  retention_blocked_reason = NULL
     RETURNING WITH (OLD AS prior) moderation.id,
       (prior.retention_blocked_reason = 'newest') IS TRUE AS was_newest`,
    [pending.map(row => row.id), pending.map(row => row.post_id)],
  )
  return rows.flatMap(row => (row.was_newest ? [row.id] : []))
}
