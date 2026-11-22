import { write } from '@data-stores/psql'

type Candidate = { id: string; post_id: string }

export async function reconcileAgentModerationRetentionPage(pending: readonly Candidate[]) {
  // Keep the predecessor writes separate from the due transaction's source locks.
  // Check apparent keepers after the drain commits so an unseen successor can commit first.
  const { rows } = await write<{ id: string; woke_predecessor: boolean }>(
    `/* reconcileAgentModerationRetentionPage */
     WITH sources AS (
       SELECT moderation.id, moderation.post_id, moderation.deleted_at,
         moderation.retention_blocked_reason = 'check_newest' AS check_newest,
         CASE WHEN moderation.retention_blocked_reason = 'check_newest' THEN (
           SELECT newer.id FROM agent_moderations newer
           WHERE newer.post_id = moderation.post_id AND newer.prompt_id = moderation.prompt_id
             AND newer.id > moderation.id
           LIMIT 1
         ) IS NOT NULL AND (
           moderation.deleted_at IS NOT NULL OR (
             SELECT newer.id FROM agent_moderations newer
             WHERE newer.post_id = moderation.post_id AND newer.prompt_id = moderation.prompt_id
               AND newer.id > moderation.id AND newer.deleted_at IS NULL
             LIMIT 1
           ) IS NOT NULL
         ) END AS superseded,
         CASE WHEN moderation.retention_blocked_reason = 'reconcile' THEN (
           SELECT CASE WHEN moderation.deleted_at IS NULL OR prior.deleted_at IS NOT NULL THEN prior.id END
           FROM agent_moderations prior
           WHERE prior.post_id = moderation.post_id AND prior.prompt_id = moderation.prompt_id
             AND prior.id < moderation.id
           ORDER BY prior.id DESC LIMIT 1
         ) END AS previous_id,
         CASE WHEN moderation.retention_blocked_reason = 'reconcile' AND moderation.deleted_at IS NULL THEN (
           SELECT prior.id FROM agent_moderations prior
           WHERE prior.post_id = moderation.post_id AND prior.prompt_id = moderation.prompt_id
             AND prior.id < moderation.id AND prior.deleted_at IS NULL
           ORDER BY prior.id DESC LIMIT 1
         ) END AS previous_live_id
       FROM unnest($1::uuid[], $2::uuid[]) AS page(id, post_id)
       CROSS JOIN LATERAL (
         SELECT id, post_id, prompt_id, deleted_at, retention_blocked_reason FROM agent_moderations
         WHERE id = page.id AND post_id = page.post_id
           AND retention_blocked_reason IN ('reconcile', 'check_newest')
         LIMIT 1
       ) AS moderation
     )
     MERGE INTO agent_moderations moderation
     USING (
       SELECT source.post_id, target.id,
              bool_or(target.settle) AS settle,
              bool_or(NOT target.settle) AS wake,
              bool_or(source.check_newest) FILTER (WHERE target.settle) AS check_newest,
              bool_or(source.superseded) FILTER (WHERE target.settle) AS superseded,
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
     WHEN MATCHED AND target.settle AND NOT target.check_newest
       AND moderation.retention_blocked_reason = 'reconcile'
       AND moderation.deleted_at IS NOT DISTINCT FROM target.deleted_at THEN
       UPDATE SET retention_blocked_reason = NULL
     WHEN MATCHED AND target.settle AND target.check_newest
       AND moderation.retention_blocked_reason = 'check_newest'
       AND moderation.deleted_at IS NOT DISTINCT FROM target.deleted_at THEN
       UPDATE SET retention_due_at = CASE WHEN target.superseded THEN moderation.retention_due_at END,
                  retention_blocked_reason = CASE WHEN NOT target.superseded
                    THEN 'newest'::agent_moderation_retention_block_reasons END
     WHEN MATCHED AND target.wake
       AND moderation.retention_blocked_reason IN ('newest', 'check_newest') THEN
       UPDATE SET retention_due_at = uuid_extract_timestamp(moderation.id) + INTERVAL '90 days',
                  retention_blocked_reason = NULL
     RETURNING WITH (OLD AS prior) moderation.id,
       (target.wake AND prior.retention_blocked_reason IN ('newest', 'check_newest')
         AND moderation.retention_blocked_reason IS NULL) IS TRUE AS woke_predecessor`,
    [pending.map(row => row.id), pending.map(row => row.post_id)],
  )
  return rows.flatMap(row => (row.woke_predecessor ? [row.id] : []))
}
