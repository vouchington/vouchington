/* oxlint-disable no-await-in-loop -- fixed relation families and ordered stream consumption use bounded pages serially. */
import { read } from '@data-stores/psql'
import { getEntityRelationVoteTableIdentifier } from '@data-stores/psql/config-driven/utils/election-sql-identifiers'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import sql from 'sql-template-strings'
import { getDataRequestLimits } from './work-limits.mts'

type VoteStream = AsyncGenerator<Record<string, unknown>, unknown, void>
type RelationUserVoteRow = {
  id: string
  entity_relation_id: string
  score: number | null
  created_at: Date
}

/** Merge fixed-family index pages without holding a cursor connection per family. */
export async function* streamRelationVotes(userId: string): VoteStream {
  const batchSize = getDataRequestLimits().batchSize
  const families = entityRelationMetadatum.flatMap(({ table_name: table, election }) =>
    election
      ? [
          {
            table,
            rows: [] as RelationUserVoteRow[],
            position: 0,
            after: undefined as string | undefined,
            complete: false,
          },
        ]
      : [],
  )
  while (true) {
    for (const family of families) {
      if (family.complete || family.position < family.rows.length) continue
      // no-mistakes-disable-next-line query-reached-per-item: fixed metadata families use bounded index pages without holding a cursor connection per family
      family.rows = await readRelationVoteExportPage(userId, family.table, {
        limit: batchSize,
        after: family.after,
      })
      family.position = 0
      family.complete = family.rows.length < batchSize
      family.after = family.rows.at(-1)?.id
    }
    const family = families
      .filter(entry => entry.position < entry.rows.length)
      .toSorted((left, right) =>
        left.rows[left.position]!.id.localeCompare(right.rows[right.position]!.id),
      )[0]
    if (!family) return
    const row = family.rows[family.position++]!
    yield {
      sort_id: row.id,
      entity_type: 'entity_relation',
      entity_id: row.entity_relation_id,
      choice:
        row.score === null || row.score === 0 ? 'clear' : row.score === 1 ? 'confirm' : 'dispute',
      created_at: row.created_at,
    }
  }
}

/** Retain the original cross-family event order in votes.csv. */
export async function* mergeVoteStreams(left: VoteStream, right: VoteStream): VoteStream {
  try {
    let first = await left.next()
    let second = await right.next()
    while (!first.done || !second.done) {
      if (
        second.done ||
        (!first.done && String(first.value.sort_id) <= String(second.value.sort_id))
      ) {
        yield first.value as Record<string, unknown>
        first = await left.next()
      } else {
        yield second.value as Record<string, unknown>
        second = await right.next()
      }
    }
  } finally {
    await Promise.all([left.return(undefined), right.return(undefined)])
  }
  return undefined
}

async function readRelationVoteExportPage(
  userId: string,
  relationTable: string,
  pagination: { limit: number; after?: string },
): Promise<RelationUserVoteRow[]> {
  const statement = sql`/* readRelationVoteExportPage */ SELECT id, entity_relation_id, score, created_at FROM `
  statement.append(getEntityRelationVoteTableIdentifier(relationTable))
  statement.append(sql` WHERE user_id = ${userId}`)
  if (pagination.after) statement.append(sql` AND id > ${pagination.after}::uuid`)
  statement.append(sql` ORDER BY id LIMIT ${pagination.limit}`)
  return (await read<RelationUserVoteRow>(statement)).rows
}
