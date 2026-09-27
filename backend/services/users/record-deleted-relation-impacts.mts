import type { TransactionQuery } from '@data-stores/psql/types'
import { getEntityRelationIntegrityTargetColumn } from '@services/entity-relations/metadata'
import { addUserDeletionRelationEffects } from '@services/user-deletions/external-work'
import type { EntityRelationVoteTarget } from './delete-entity-relation-votes.mts'
import { getElectedRelationMetadata } from './relation-impact-targets.mts'

/** The deleted vote tuple, not a pre-delete candidate, authorizes each retained relation identity. */
export async function recordDeletedRelationImpacts(
  query: TransactionQuery,
  requestId: string,
  deleted: readonly EntityRelationVoteTarget[],
): Promise<void> {
  const byTable = new Map<string, EntityRelationVoteTarget[]>()
  const rootPins = new Map<string, { family: string; id: string }>()
  for (const target of deleted) {
    const metadata = getElectedRelationMetadata(target.relationTable)
    rootPins.set(`${metadata.subject_type}:${target.subjectId}`, {
      family: metadata.subject_type,
      id: target.subjectId,
    })
    const targets = byTable.get(target.relationTable) ?? []
    targets.push(target)
    byTable.set(target.relationTable, targets)
  }
  for (const root of [...rootPins.values()].toSorted(
    (left, right) => left.family.localeCompare(right.family) || left.id.localeCompare(right.id),
  )) {
    // oxlint-disable-next-line no-await-in-loop -- all concrete roots are pinned in stable order before dependent tuples.
    await query(
      `/* pinDeletedRelationSubjectRoot */ SELECT fn_ensure_retained_${root.family}_identity($1::uuid)`,
      [root.id],
    )
  }
  for (const [relationTable, targets] of [...byTable].toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    // oxlint-disable-next-line no-await-in-loop -- sorted concrete relation owners preserve FK lock order.
    await recordRelationTableImpacts(query, requestId, relationTable, targets)
  }
}

async function recordRelationTableImpacts(
  query: TransactionQuery,
  requestId: string,
  relationTable: string,
  targets: readonly EntityRelationVoteTarget[],
): Promise<void> {
  const metadata = getElectedRelationMetadata(relationTable)
  const retained = `retained_${metadata.table_name}`
  const column = getEntityRelationIntegrityTargetColumn(metadata)
  const unique = [
    ...new Map(
      targets.map(target => [`${target.subjectId}:${target.entityRelationId}`, target]),
    ).values(),
  ]
  const subjects = unique.map(target => target.subjectId)
  const relations = unique.map(target => target.entityRelationId)
  // A conflicting orphan may disappear between ON CONFLICT and the pin while the
  // separate cleanup transaction runs. Retry until every target holds KEY SHARE.
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- the retry closes the concurrent orphan-GC gap.
    await query(
      `/* ensureDeletedRelationIdentities */
       INSERT INTO ${retained} (subject_id, id)
       SELECT subject_id, relation_id FROM UNNEST($1::uuid[], $2::uuid[]) AS target(subject_id, relation_id)
       ORDER BY subject_id, relation_id ON CONFLICT (subject_id, id) DO NOTHING`,
      [subjects, relations],
    )
    // oxlint-disable-next-line no-await-in-loop -- all retained tuples must be pinned before dependent impacts.
    const { rows } = await query<{ subject_id: string; id: string }>(
      `/* pinDeletedRelationIdentities */
       SELECT owner.subject_id, owner.id FROM ${retained} owner
       JOIN UNNEST($1::uuid[], $2::uuid[]) AS target(subject_id, relation_id)
         ON target.subject_id = owner.subject_id AND target.relation_id = owner.id
       ORDER BY owner.subject_id, owner.id FOR KEY SHARE OF owner`,
      [subjects, relations],
    )
    if (rows.length === unique.length) break
  }

  await query(
    `/* insertDeletedRelationImpacts */
     INSERT INTO user_deletion_relation_impacts (request_id, subject_id, ${column})
     SELECT $1::uuid, subject_id, relation_id
     FROM UNNEST($2::uuid[], $3::uuid[]) AS target(subject_id, relation_id)
     ORDER BY subject_id, relation_id ON CONFLICT DO NOTHING`,
    [requestId, subjects, relations],
  )
  const { rows: impacts } = await query<{ id: string }>(
    `/* findDeletedRelationImpacts */
     SELECT impact.id FROM user_deletion_relation_impacts impact
     JOIN UNNEST($2::uuid[], $3::uuid[]) AS target(subject_id, relation_id)
       ON impact.subject_id = target.subject_id AND impact.${column} = target.relation_id
     WHERE impact.request_id = $1::uuid ORDER BY impact.id`,
    [requestId, subjects, relations],
  )
  await addUserDeletionRelationEffects(
    requestId,
    impacts.map(impact => impact.id),
    query,
  )
}
