import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { CopyrightActionIntentRecord } from './types.mts'

export type CopyrightActionIntentInput = {
  restrictionId: string
  placementRevision: number
  action: 'withhold' | 'restore'
}

/** Inserts many intents (duplicates resolved without update) and returns them in input order. */
export async function insertCopyrightActionIntents(
  query: TransactionQuery,
  inputs: readonly CopyrightActionIntentInput[],
): Promise<CopyrightActionIntentRecord[]> {
  if (inputs.length === 0) return []
  const restrictionIds = inputs.map(input => input.restrictionId)
  const revisions = inputs.map(input => input.placementRevision)
  const actions = inputs.map(input => input.action)
  // Resolve a concurrent duplicate in a fresh statement without updating the existing intent.
  await query(sql`/* insertCopyrightActionIntents */
    INSERT INTO copyright_notice_action_work_items (
      copyright_restriction_id, copyright_notice_deadline_id, expected_placement_revision, action
    )
    SELECT input.restriction_id, NULL, input.placement_revision, input.action
    FROM unnest(${restrictionIds}::uuid[], ${revisions}::integer[], ${actions}::copyright_notice_action_intent_actions[])
      WITH ORDINALITY AS input(restriction_id, placement_revision, action, ordinal)
    ORDER BY input.restriction_id ASC NULLS LAST, input.placement_revision ASC NULLS LAST,
      input.action ASC NULLS LAST
    ON CONFLICT (copyright_restriction_id, expected_placement_revision, action) DO NOTHING
  `)
  const { rows } = await query<CopyrightActionIntentRecord & { ordinal: string }>(sql`
    /* insertCopyrightActionIntents:read */
    SELECT input.ordinal, work.id, work.copyright_restriction_id, work.copyright_notice_deadline_id,
      work.expected_placement_revision, work.action, work.state, work.attempt_count, work.leased_at,
      work.completed_at, work.completed_at_reason, work.failure_message, work.available_at, work.lease_token
    FROM unnest(${restrictionIds}::uuid[], ${revisions}::integer[], ${actions}::copyright_notice_action_intent_actions[])
      WITH ORDINALITY AS input(restriction_id, placement_revision, action, ordinal)
    JOIN copyright_notice_action_work_items work
      ON work.copyright_restriction_id = input.restriction_id
     AND work.expected_placement_revision = input.placement_revision
     AND work.action = input.action
    ORDER BY input.ordinal
  `)
  const ordered = rows.toSorted((left, right) => Number(left.ordinal) - Number(right.ordinal))
  assert(ordered.length === inputs.length, 500, 'Copyright action intent was not recorded')
  return ordered.map(({ ordinal: _ordinal, ...record }) => record)
}

export async function insertCopyrightActionIntent(
  query: TransactionQuery,
  restrictionId: string,
  placementRevision: number,
  action: 'withhold' | 'restore',
): Promise<CopyrightActionIntentRecord> {
  const [intent] = await insertCopyrightActionIntents(query, [
    { restrictionId, placementRevision, action },
  ])
  return intent!
}
