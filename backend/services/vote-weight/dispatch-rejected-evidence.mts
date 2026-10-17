import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  VoteWeightDispatchEvent,
  VoteWeightDispatchWindow,
  VoteWeightRejectedEvidenceKeyset,
} from '@queues/vote-aggregation/enqueues/types-dispatch'

type Evidence = { at: string; id: string; observation_id: string | null }
type Source = { membership_source_id: string; user_id: string | null }

export async function findRejectedEvidenceEvents(
  window: VoteWeightDispatchWindow,
  after: VoteWeightRejectedEvidenceKeyset | undefined,
  cap: number,
): Promise<{ events: VoteWeightDispatchEvent[]; next: VoteWeightRejectedEvidenceKeyset | null }> {
  const evidenceQuery = sql`/* dispatchVoteWeightFamilySourceChanges:rejected_at:evidence */
    SELECT evidence.rejected_at::text AS at, evidence.id,
      (SELECT id FROM membership_provider_observations
       WHERE membership_provider_evidence_record_id = evidence.id LIMIT 1) AS observation_id
    FROM membership_provider_evidence_records evidence
    WHERE evidence.rejected_at IS NOT NULL
      AND evidence.rejected_at <= ${window.windowEnd}::timestamptz`
  if (window.windowStart)
    evidenceQuery.append(sql` AND evidence.rejected_at >= ${window.windowStart}::timestamptz`)
  if (after?.afterSourceId)
    evidenceQuery.append(sql`
      AND evidence.rejected_at = ${after.at}::timestamptz AND evidence.id = ${after.id}::uuid`)
  else if (after)
    evidenceQuery.append(sql`
      AND (evidence.rejected_at, evidence.id) > (${after.at}::timestamptz, ${after.id}::uuid)`)
  evidenceQuery.append(sql` ORDER BY evidence.rejected_at, evidence.id LIMIT 1`)
  const evidence = (await write<Evidence>(evidenceQuery)).rows[0]
  if (!evidence) return { events: [], next: null }

  if (!evidence.observation_id) return { events: [], next: { at: evidence.at, id: evidence.id } }
  const sourceQuery = sql`/* dispatchVoteWeightFamilySourceChanges:rejected_at:sources */
    SELECT source_state.membership_source_id, source.user_id
    FROM membership_source_states source_state
    INNER JOIN membership_sources source ON source.id = source_state.membership_source_id
    WHERE source_state.membership_provider_observation_id = ${evidence.observation_id}::uuid`
  if (after?.afterSourceId)
    sourceQuery.append(sql` AND source_state.membership_source_id > ${after.afterSourceId}::uuid`)
  sourceQuery.append(sql` ORDER BY source_state.membership_source_id LIMIT ${cap}`)
  const { rows } = await write<Source>(sourceQuery)
  const last = rows.at(-1)
  const next =
    rows.length === cap && last
      ? { at: evidence.at, id: evidence.id, afterSourceId: last.membership_source_id }
      : { at: evidence.at, id: evidence.id }
  return {
    events: rows.flatMap(row =>
      row.user_id
        ? [
            {
              userId: row.user_id,
              jobId: `voteWeight__${row.user_id}__evidenceRejected__${evidence.id}`,
            },
          ]
        : [],
    ),
    next,
  }
}
