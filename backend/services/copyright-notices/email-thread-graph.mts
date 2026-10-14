import type { TransactionQuery } from '@data-stores/psql/types'
import { COPYRIGHT_EMAIL_THREAD_CHANGED } from '@modules/on-error/error-codes'
import createError from 'http-errors'
import sql from 'sql-template-strings'

export type CopyrightEmailThreadGraph = {
  intakeIds: string[]
  descendantIntakeIds: string[]
  edges: string[]
  observedRows: number
  overflow: boolean
}

/**
 * Read at most maxRows + 1 graph rows. Each indexed wave fetches no more edges than the remaining
 * budget plus one; visited intake ids stop cycles, and every edge identity is retained for replay.
 */
export async function readCopyrightEmailThreadGraph(
  transaction: TransactionQuery,
  rootId: string,
  maxRows: number,
): Promise<CopyrightEmailThreadGraph> {
  const intakeIds = new Set([rootId])
  const descendants = new Set([rootId])
  const edges = new Set<string>()
  const parentsByReply = new Map<string, Set<string>>()
  let frontier = [rootId]
  while (frontier.length > 0) {
    const remaining = maxRows - intakeIds.size - edges.size
    // eslint-disable-next-line no-await-in-loop -- each indexed wave discovers the next bounded frontier.
    const { rows } = await transaction<{ reply_id: string; ancestor_id: string }>( // no-mistakes-disable-line query-reached-per-item: each indexed wave is bounded by the remaining graph budget and discovers the next frontier
      sql`
      /* readCopyrightEmailThreadGraph:boundedWave */
      SELECT edge.reply_message_intake_id AS reply_id,
        edge.ancestor_message_intake_id AS ancestor_id
      FROM unnest(${frontier}::uuid[]) AS parent(id)
      JOIN LATERAL (
        SELECT reply_message_intake_id, ancestor_message_intake_id
        FROM copyright_notice_email_message_ancestors
        WHERE ancestor_message_intake_id = parent.id
        ORDER BY reply_message_intake_id
        LIMIT ${remaining + 1}
      ) edge ON true
      LIMIT ${remaining + 1}
    `,
    )
    const next: string[] = []
    for (const row of rows) {
      edges.add(`${row.reply_id}:${row.ancestor_id}`)
      const parents = parentsByReply.get(row.reply_id) ?? new Set<string>()
      parents.add(row.ancestor_id)
      parentsByReply.set(row.reply_id, parents)
      if (!intakeIds.has(row.reply_id)) {
        intakeIds.add(row.reply_id)
        descendants.add(row.reply_id)
        next.push(row.reply_id)
      }
      const observedRows = intakeIds.size + edges.size
      if (observedRows > maxRows) {
        return snapshot(true)
      }
    }
    frontier = next
  }

  // A descendant may name an ancestor outside the root's descendant closure. The backfill checks
  // those parents for other notices, so count and lock them too before making any link decision.
  for (const replyId of [...descendants].toSorted()) {
    const remaining = maxRows - intakeIds.size - edges.size
    const knownParents = [...(parentsByReply.get(replyId) ?? [])]
    // eslint-disable-next-line no-await-in-loop -- each indexed reply lookup consumes the remaining graph budget.
    const { rows } = await transaction<{ ancestor_id: string }>( // no-mistakes-disable-line query-reached-per-item: each indexed incoming-edge page consumes at most the remaining graph budget plus one
      sql`
      /* readCopyrightEmailThreadGraph:incoming */
      SELECT ancestor_message_intake_id AS ancestor_id
      FROM copyright_notice_email_message_ancestors
      WHERE reply_message_intake_id = ${replyId}
        AND ancestor_message_intake_id <> ALL(${knownParents}::uuid[])
      ORDER BY ancestor_message_intake_id
      LIMIT ${remaining + 1}
    `,
    )
    for (const row of rows) {
      edges.add(`${replyId}:${row.ancestor_id}`)
      intakeIds.add(row.ancestor_id)
      if (intakeIds.size + edges.size > maxRows) return snapshot(true)
    }
  }
  return snapshot(false)

  function snapshot(overflow: boolean): CopyrightEmailThreadGraph {
    return {
      intakeIds: [...intakeIds].toSorted(),
      descendantIntakeIds: [...descendants].toSorted(),
      edges: [...edges].toSorted(),
      observedRows: intakeIds.size + edges.size,
      overflow,
    }
  }
}

/** FOR UPDATE, unlike NO KEY UPDATE, fences FK inserts of new edges and thread links. */
export async function lockCopyrightEmailGraphIntakes(
  transaction: TransactionQuery,
  intakeIds: readonly string[],
): Promise<void> {
  const { rows } = await transaction<{ id: string }>(sql`
    /* lockCopyrightEmailGraphIntakes */
    SELECT id FROM copyright_notice_email_intakes
    WHERE id = ANY(${[...intakeIds].toSorted()}::uuid[])
    ORDER BY id FOR UPDATE
  `)
  if (rows.length !== intakeIds.length) throw copyrightEmailThreadChangedError()
}

export function assertCopyrightEmailGraphUnchanged(
  before: CopyrightEmailThreadGraph,
  after: CopyrightEmailThreadGraph,
): void {
  if (
    before.overflow !== after.overflow ||
    before.intakeIds.length !== after.intakeIds.length ||
    before.descendantIntakeIds.length !== after.descendantIntakeIds.length ||
    before.edges.length !== after.edges.length ||
    before.intakeIds.some((id, i) => id !== after.intakeIds[i]) ||
    before.descendantIntakeIds.some((id, i) => id !== after.descendantIntakeIds[i]) ||
    before.edges.some((edge, i) => edge !== after.edges[i])
  ) {
    throw copyrightEmailThreadChangedError()
  }
}

export function copyrightEmailThreadChangedError() {
  return Object.assign(createError(409, 'Copyright email thread changed; retry staff approval'), {
    code: COPYRIGHT_EMAIL_THREAD_CHANGED,
  })
}
