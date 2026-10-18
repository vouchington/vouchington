import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  VoteWeightDispatchEvent,
  VoteWeightDispatchWindow,
  VoteWeightRejectedEvidenceKeyset,
} from '@queues/vote-aggregation/enqueues/types-dispatch'

type Evidence = {
  at: string
  id: string
  lineage_id: string | null
  source_kind: 'direct' | 'family' | null
}
type Source = { membership_source_id: string; user_id: string | null }

export async function findRejectedEvidenceEvents(
  window: VoteWeightDispatchWindow,
  after: VoteWeightRejectedEvidenceKeyset | undefined,
  cap: number,
): Promise<{ events: VoteWeightDispatchEvent[]; next: VoteWeightRejectedEvidenceKeyset | null }> {
  const evidenceQuery = sql`/* dispatchVoteWeightFamilySourceChanges:rejected_at:evidence */
    SELECT evidence.rejected_at::text AS at, evidence.id,
      observation.membership_provider_lineage_id AS lineage_id, observation.source_kind
    FROM membership_provider_evidence_records evidence
    LEFT JOIN membership_provider_observations observation
      ON observation.membership_provider_evidence_record_id = evidence.id
      AND observation.membership_provider_lineage_id = evidence.membership_provider_lineage_id
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

  if (!evidence.lineage_id || !evidence.source_kind)
    return { events: [], next: { at: evidence.at, id: evidence.id } }
  // The source-state FK ties its lineage to this source; the lateral PK check keeps source-id order.
  const sourceQuery = sql`/* dispatchVoteWeightFamilySourceChanges:rejected_at:sources */
    SELECT source.id AS membership_source_id, source.user_id
    FROM membership_sources source
    CROSS JOIN LATERAL (
      SELECT membership_source_id FROM membership_source_states
      WHERE membership_source_id = source.id
      LIMIT 1
    ) source_state
    WHERE source.membership_provider_lineage_id = ${evidence.lineage_id}::uuid
      AND source.source_kind = ${evidence.source_kind}::membership_source_kinds`
  if (after?.afterSourceId) sourceQuery.append(sql` AND source.id > ${after.afterSourceId}::uuid`)
  sourceQuery.append(sql` ORDER BY source.id LIMIT ${cap}`)
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
